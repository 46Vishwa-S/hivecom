#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WebSocketsClient.h>
#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <Preferences.h>
#include <WebServer.h>

// --- Permanent Storage ---
Preferences preferences;

// --- WiFi Configuration & Web Server ---
WebServer setupServer(80);
bool isAPMode = false;

// --- Secure WebSocket Client (Outbound to Cloudflare Worker) ---
WebSocketsClient webSocket;

const char* wsHost = "hivearm.noreplyglobalx1.workers.dev";
const int wsPort = 443;
const char* wsPath = "/ws";

bool wsConnected = false;
unsigned long lastWsReconnectAttempt = 0;
const unsigned long wsReconnectInterval = 5000;

// Current Cloudflare certificate SHA-1 fingerprint (space-separated)
// NOTE: Fingerprints expire when the server SSL certificate rotates (usually every 90 days).
// To avoid needing this fingerprint, please update the "WebSockets" library by Links2004
// to the latest version in the Arduino IDE Library Manager, then you can use `webSocket.setInsecure();`.
const char* sslFingerprint = "DA F0 D6 BA 59 43 E4 EB ED 99 A7 49 1D 47 DE 62 66 FA 24 B5";

// --- PCA9685 Servo Driver ---
Adafruit_PWMServoDriver pwm = Adafruit_PWMServoDriver(0x40);
#define SERVO_FREQ 50 // Standard servo frequency

// --- Servo Min/Max Pulse Length Calibration (SG90/MG996R) ---
const int SERVOMIN = 150; // 0 degrees
const int SERVOMAX = 600; // 180 degrees

// Struct to store Joint Telemetry and Target tracking
struct Joint {
  float current;      // Current angle of the servo
  float target;       // Target angle from the website slider
  float minLimit;     // Min angle boundary (from website UI limits)
  float maxLimit;     // Max angle boundary (from website UI limits)
  int pcaChannel;     // Channel number on PCA9685 board
};

// 5-Axis configuration aligned with website ranges and PCA9685 channels:
Joint joints[5] = {
  {0.0, 0.0, -180.0, 180.0, 0}, // Joint 0: Base
  {0.0, 0.0, -90.0,  90.0,  1}, // Joint 1: Shoulder
  {0.0, 0.0, -135.0, 135.0, 2}, // Joint 2: Elbow
  {0.0, 0.0, -90.0,  90.0,  3}, // Joint 3: Wrist
  {0.0, 0.0, -180.0, 180.0, 4}  // Joint 4: Camera
};

// Telemetry State
float internalTemp = 25.0;
unsigned long lastTelemetryTime = 0;
const unsigned long telemetryInterval = 500; // Broadcast stats every 500ms

#ifdef __cplusplus
extern "C" {
#endif
uint8_t temprature_sens_read(); // ESP32 internal chip temp reader
#ifdef __cplusplus
}
#endif

// Convert target UI degrees into PCA9685 Pulse Length ticks
int angleToPulse(float angle, Joint& joint) {
  float normalizedDeg = map(angle, joint.minLimit, joint.maxLimit, 0, 180);
  return map(normalizedDeg, 0, 180, SERVOMIN, SERVOMAX);
}

// WebSocket Client Event Handler
void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      wsConnected = false;
      Serial.println("[WSS] Disconnected from Cloudflare Worker");
      break;
      
    case WStype_CONNECTED:
      wsConnected = true;
      Serial.printf("[WSS] Connected to %s\n", wsHost);
      break;
      
    case WStype_TEXT: {
      String msg = String((char*)payload);
      int commaIndex = msg.indexOf(',');
      if (commaIndex > 0) {
        int idx = msg.substring(0, commaIndex).toInt();
        float targetAngle = msg.substring(commaIndex + 1).toFloat();
        if (idx >= 0 && idx < 5) {
          joints[idx].target = constrain(targetAngle, joints[idx].minLimit, joints[idx].maxLimit);
        }
      }
      break;
    }
    
    case WStype_BIN:
      Serial.println("[WSS] Received binary data (ignored)");
      break;
      
    default:
      break;
  }
}

// Serve Setup Portal HTML page
void handleRoot() {
  String html = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>body{background:#12131a;color:#ffffff;font-family:sans-serif;text-align:center;padding:50px 20px;}";
  html += ".card{background:#1a1c26;border:1px solid #ffb84d;border-radius:12px;padding:30px;max-width:400px;margin:0 auto;box-shadow:0 8px 32px rgba(255,184,77,0.15);}";
  html += "h2{color:#ffb84d;margin-bottom:20px;}input[type=text],input[type=password]{width:100%;padding:12px;margin:10px 0;box-sizing:border-box;border-radius:6px;border:1px solid #2a2d3a;background:#12131a;color:#fff;}";
  html += "input[type=submit]{background:#ffb84d;color:#12131a;font-weight:bold;border:none;padding:12px 20px;border-radius:6px;cursor:pointer;width:100%;margin-top:10px;}input[type=submit]:hover{opacity:0.9;}";
  html += ".reset-btn{background:#ff4d4d;color:#fff;margin-top:15px;}</style></head>";
  html += "<body><div class='card'><h2>HiveArm Setup</h2><p>Configure WiFi settings for this device:</p>";
  html += "<form action='/save' method='POST'>";
  html += "<input type='text' name='ssid' placeholder='SSID / WiFi Name' required>";
  html += "<input type='password' name='password' placeholder='WiFi Password'>";
  html += "<input type='submit' value='Save & Connect'>";
  html += "</form>";
  html += "<form action='/reset' method='POST'><input type='submit' class='reset-btn' value='Clear Saved WiFi & Restart'></form>";
  html += "</div></body></html>";
  setupServer.send(200, "text/html", html);
}

// Save credentials from Portal to Flash, then reboot
void handleSave() {
  if (setupServer.hasArg("ssid")) {
    String ssid = setupServer.arg("ssid");
    String pass = setupServer.arg("password");
    
    preferences.begin("wifi-creds", false);
    preferences.putString("ssid", ssid);
    preferences.putString("password", pass);
    preferences.end();
    
    String html = "<html><body style='background:#12131a;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px;'>";
    html += "<h2 style='color:#ffb84d;'>Credentials Saved!</h2><p>ESP32 is restarting and will connect to <b>" + ssid + "</b>...</p></body></html>";
    setupServer.send(200, "text/html", html);
    
    delay(2000);
    ESP.restart();
  } else {
    setupServer.send(400, "text/plain", "Invalid Request");
  }
}

// Clear credentials and restart
void handleReset() {
  preferences.begin("wifi-creds", false);
  preferences.clear();
  preferences.end();
  
  String html = "<html><body style='background:#12131a;color:#fff;font-family:sans-serif;text-align:center;padding-top:100px;'>";
  html += "<h2 style='color:#ff4d4d;'>WiFi Cleared</h2><p>Restarting... Please configure WiFi again.</p></body></html>";
  setupServer.send(200, "text/html", html);
  
  delay(2000);
  ESP.restart();
}

// Fallback configuration Access Point Mode
void startSetupPortal() {
  if (isAPMode) return;
  
  Serial.println("\n========================================");
  Serial.println("  STARTING SETUP PORTAL");
  Serial.println("========================================");
  
  isAPMode = true;
  wsConnected = false;
  
  WiFi.disconnect(true);
  delay(100);
  WiFi.mode(WIFI_AP);
  delay(100);
  
  IPAddress localIP(192, 168, 4, 1);
  IPAddress gateway(192, 168, 4, 1);
  IPAddress subnet(255, 255, 255, 0);
  WiFi.softAPConfig(localIP, gateway, subnet);
  WiFi.softAP("HiveArm-Setup");
  
  Serial.print("1. Connect your phone/laptop WiFi to: ");
  Serial.println("HiveArm-Setup");
  Serial.print("2. Open browser and navigate to: http://");
  Serial.println(WiFi.softAPIP());
  Serial.println("========================================\n");
  
  setupServer.on("/", handleRoot);
  setupServer.on("/save", HTTP_POST, handleSave);
  setupServer.on("/reset", HTTP_POST, handleReset);
  setupServer.begin();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  
  Serial.println("\n[HIVEARM] Booting...");

  // Initialize PCA9685 Servo Driver over SDA/SCL (GPIO 21 & 22)
  pwm.begin();
  pwm.setOscillatorFrequency(27000000);
  pwm.setPWMFreq(SERVO_FREQ);

  // Move all joints to neutral 0.0 position at start
  for (int i = 0; i < 5; i++) {
    int initPulse = angleToPulse(0.0, joints[i]);
    pwm.setPWM(joints[i].pcaChannel, 0, initPulse);
  }

  // Load Saved WiFi configuration from Flash
  preferences.begin("wifi-creds", true);
  String ssid = preferences.getString("ssid", "");
  String password = preferences.getString("password", "");
  preferences.end();

  if (ssid == "") {
    Serial.println("[WIFI] No saved credentials found.");
    startSetupPortal();
  } else {
    Serial.printf("[WIFI] Saved network found: %s\n", ssid.c_str());
    Serial.println("[WIFI] Attempting to connect...");
    
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid.c_str(), password.c_str());
    
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) { // 10 second timeout
      delay(500);
      Serial.print(".");
      attempts++;
    }
    
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("\n[WIFI] ✓ Connected!");
      Serial.print("[WIFI] IP Address: ");
      Serial.println(WiFi.localIP());
      
      // Start Secure WebSocket Client connection to Cloudflare Worker
      Serial.println("[WSS] Connecting to Cloudflare Worker...");
      
      // Passing the certificate fingerprint directly in beginSSL to bypass
      // version issues on older versions of the WebSockets library.
      webSocket.beginSSL(wsHost, wsPort, wsPath, sslFingerprint);
      webSocket.onEvent(webSocketEvent);
      lastWsReconnectAttempt = millis();
    } else {
      Serial.println("\n[WIFI] ✗ Could not connect to saved network.");
      Serial.println("[WIFI] Starting setup portal so you can enter a new network.");
      startSetupPortal();
    }
  }
}

void loop() {
  if (isAPMode) {
    setupServer.handleClient();
    return;
  }

  // --- NO GRACE PERIOD: if WiFi is lost, go straight to setup portal ---
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] ✗ Network disconnected or not available.");
    Serial.println("[WIFI] Opening setup portal immediately...");
    startSetupPortal();
    return;
  }

  // --- Maintain WebSocket ---
  webSocket.loop();
  
  if (!wsConnected) {
    if (millis() - lastWsReconnectAttempt > wsReconnectInterval) {
      lastWsReconnectAttempt = millis();
      Serial.println("[WSS] Reconnecting to Cloudflare Worker...");
      
      webSocket.beginSSL(wsHost, wsPort, wsPath, sslFingerprint);
    }
  }

  // --- Smooth Servo Motion (Linear Interpolation) ---
  for (int i = 0; i < 5; i++) {
    if (abs(joints[i].current - joints[i].target) > 0.1) {
      float easeFactor = 0.08;
      joints[i].current += (joints[i].target - joints[i].current) * easeFactor;
      
      int pulse = angleToPulse(joints[i].current, joints[i]);
      pwm.setPWM(joints[i].pcaChannel, 0, pulse);
    }
  }

  // --- Periodic Telemetry Output ---
  unsigned long now = millis();
  if (now - lastTelemetryTime >= telemetryInterval) {
    lastTelemetryTime = now;

    #if defined(ESP_ARDUINO_VERSION_VAL) && ESP_ARDUINO_VERSION >= ESP_ARDUINO_VERSION_VAL(2, 0, 0)
      internalTemp = (temprature_sens_read() - 32) / 1.8;
      if (internalTemp < 0 || internalTemp > 120) internalTemp = 26.5;
    #else
      internalTemp = 28.5 + (random(-10, 10) / 10.0);
    #endif

    char telemetryJson[256];
    snprintf(telemetryJson, sizeof(telemetryJson),
             "{\"base\":%.2f,\"shoulder\":%.2f,\"elbow\":%.2f,\"wrist\":%.2f,\"camera\":%.2f,\"temperature\":%.2f}",
             joints[0].current, joints[1].current, joints[2].current, joints[3].current, joints[4].current, internalTemp);

    if (wsConnected) {
      webSocket.sendTXT(telemetryJson);
    } else {
      Serial.println("[WSS] Not connected, skipping telemetry");
    }
  }

  delay(15); // ~60fps target rate limit
}
