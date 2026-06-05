import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArmScene, type ArmState } from "@/components/ArmScene";
import { AxisSlider } from "@/components/AxisSlider";
import { HiveLogo } from "@/components/HiveLogo";

import {
  Activity,
  Cpu,
  Move3d,
  Plug,
  PlugZap,
  RotateCw,
  Thermometer,
  Camera,
  ArrowDownUp,
  Settings2,
  Power,
  Wifi,
  WifiOff,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "HiveArm — 5-Axis Robotic Arm Telemetry" },
      { name: "description", content: "Real-time 3D control & telemetry interface for a 5-axis ESP32 robotic arm. WebSocket-driven, dark, precise." },
      { property: "og:title", content: "HiveArm — Robotic Arm Telemetry" },
      { property: "og:description", content: "Control & visualize a 5-axis robotic arm over WebSocket in real time." },
    ],
  }),
  component: HiveArm,
});

type ConnState = "disconnected" | "connecting" | "connected";

const DEFAULT_WS = "wss://hivearm.noreplyglobalx1.workers.dev/ws";
const PRESETS: Record<string, ArmState> = {
  home:    { base: -14,   shoulder: 4,   elbow: 0,    wrist: 0,   camera: 0,   temperature: 25 },
  pickup:  { base: 45,  shoulder: 60,  elbow: 14,   wrist: 30,  camera: 0,   temperature: 32 },
  scan:    { base: -30, shoulder: 20,  elbow: -11,  wrist: 0,   camera: 45,  temperature: 28 },
  rest:    { base: 0,   shoulder: -10, elbow: -111, wrist: -20, camera: 0,   temperature: 25 },
};

function HiveArm() {
  const [state, setState] = useState<ArmState>(PRESETS.home);
  const [wsUrl, setWsUrl] = useState(DEFAULT_WS);
  const [conn, setConn] = useState<ConnState>("disconnected");
  const [log, setLog] = useState<string[]>([
    "[boot] HiveArm interface initialized",
    "[boot] Awaiting operator input",
  ]);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const autoReconnect = useRef(false);

  const pushLog = (msg: string) =>
    setLog((l) => [...l.slice(-40), `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const sendCommand = (servoIdx: number, angle: number) => {
  const s = socketRef.current;
  if (s && s.readyState === WebSocket.OPEN) {
    s.send(`${servoIdx},${angle}`);
  }
};

  const update = (key: keyof ArmState, val: number) => {
    setState((p) => ({ ...p, [key]: val }));
    const idx = { base: 0, shoulder: 1, elbow: 2, wrist: 3, camera: 4, temperature: -1 }[key];
    if (idx >= 0) sendCommand(idx, Math.round(val));
  };

  const connect = () => {
    autoReconnect.current = true;
    setConn("connecting");
    pushLog(`Connecting → ${wsUrl}`);
    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;
      ws.onopen = () => {
        setConn("connected");
        pushLog("✓ Matrix interlinked. ESP32 online.");
      };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Directly apply received telemetry without transformation
          setState((p) => ({ ...p, ...data }));
        } catch {
          pushLog(`◀ ${e.data}`);
        }
      };
      ws.onclose = () => {
        setConn("disconnected");
        pushLog("✗ Pipe broken.");
        if (autoReconnect.current) {
          reconnectRef.current = window.setTimeout(connect, 2000);
        }
      };
      ws.onerror = () => pushLog("! socket error");
    } catch (err) {
      pushLog(`! ${(err as Error).message}`);
      setConn("disconnected");
    }
  };

  const disconnect = () => {
    autoReconnect.current = false;
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
    socketRef.current?.close();
    setConn("disconnected");
    pushLog("Manual disconnect.");
  };

  useEffect(() => () => {
    autoReconnect.current = false;
    socketRef.current?.close();
    if (reconnectRef.current) clearTimeout(reconnectRef.current);
  }, []);

  const applyPreset = (name: keyof typeof PRESETS) => {
    const p = PRESETS[name];
    setState(p);
    sendCommand(0, p.base);
    sendCommand(1, p.shoulder);
    sendCommand(2, p.elbow);
    sendCommand(3, p.wrist);
    sendCommand(4, p.camera);
    pushLog(`→ preset: ${name}`);
  };

  const tempPct = Math.min(Math.max((state.temperature - 20) / 80, 0), 1);

  return (
    <div className="min-h-screen text-foreground">
      {/* TOP BAR */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1440px] mx-auto px-6 h-16 flex items-center justify-between">
          <HiveLogo />
          <nav className="hidden md:flex items-center gap-7 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground">
            <a href="#console" className="hover:text-primary transition">Console</a>
            <a href="#pipeline" className="hover:text-primary transition">Pipeline</a>
            <a href="#telemetry" className="hover:text-primary transition">Telemetry</a>
          </nav>
          <div className="flex items-center gap-3">
            <StatusBadge conn={conn} />
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 hex-grid opacity-40 pointer-events-none" />
        <div className="max-w-[1440px] mx-auto px-6 py-16 md:py-20 grid lg:grid-cols-2 gap-10 items-center relative">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-primary pulse-dot" />
              <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-primary">
                Live · 5-Axis · ESP32
              </span>
            </div>
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[0.95] tracking-tight">
              Command the <span className="text-primary text-glow">hive.</span>
              <br />Move the arm.
            </h1>
            <p className="mt-6 text-base md:text-lg text-muted-foreground max-w-2xl leading-relaxed">
              A precision telemetry console for your 5-axis robotic arm. Real-time
              WebSocket bridge from this browser → ESP32 → PCA9685 → servos. The
              3D twin moves in sync with steel.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#console"
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 text-sm font-mono uppercase tracking-[0.2em] text-primary-foreground hover:opacity-90 transition glow-honey"
              >
                <Move3d className="w-4 h-4" /> Open console
              </a>
              <a
                href="#pipeline"
                className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 text-sm font-mono uppercase tracking-[0.2em] text-foreground hover:border-primary/60 hover:text-primary transition"
              >
                <Cpu className="w-4 h-4" /> View pipeline
              </a>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-6 max-w-md">
              {[
                { k: "Axes", v: "5" },
                { k: "Latency", v: "<20ms" },
                { k: "Protocol", v: "WS" },
              ].map((s) => (
                <div key={s.k}>
                  <dd className="font-display text-3xl font-bold text-primary text-glow">{s.v}</dd>
                  <dt className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mt-1">{s.k}</dt>
                </div>
              ))}
            </dl>
          </div>
          <div className="relative h-[440px] md:h-[540px] w-full rounded-2xl border border-border/60 bg-card/40 overflow-hidden float-slow">
            <div className="absolute inset-0 hex-grid opacity-30" />
            <ArmScene state={state} />
            <div className="absolute top-4 left-4 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              ▸ Digital Twin
            </div>
            <div className="absolute bottom-4 right-4 font-mono text-[10px] uppercase tracking-[0.25em] text-primary">
              {state.temperature.toFixed(1)}°C
            </div>
          </div>
        </div>
      </section>

      {/* CONSOLE */}
      <section id="console" className="border-b border-border/60">
        <div className="max-w-[1440px] mx-auto px-6 py-12">
          <SectionHeader
            kicker="01 · Console"
            title="Operator deck"
            sub="Live sliders dispatch commands as `servoIdx,angle` strings over the open socket."
          />
          <div className="mt-10 grid lg:grid-cols-[1fr_380px] gap-6">
            {/* Viewport */}
            <div className="relative h-[480px] lg:h-[640px] rounded-2xl border border-border/60 bg-card/40 overflow-hidden">
              <ArmScene state={state} />
              <div className="absolute top-4 left-4 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em]">
                <span className={`w-2 h-2 rounded-full ${conn === "connected" ? "bg-primary pulse-dot" : "bg-muted-foreground/50"}`} />
                <span className="text-muted-foreground">3D Viewport · Slerp 0.12</span>
              </div>
              <div className="absolute top-4 right-4 flex gap-1.5">
                {(["home","pickup","scan","rest"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => applyPreset(p)}
                    className="px-2.5 py-1 rounded border border-border/60 bg-background/70 backdrop-blur text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground hover:text-primary hover:border-primary/60 transition"
                  >
                    {p}
                  </button>
                ))}
              </div>
              <TempBar pct={tempPct} temp={state.temperature} />
            </div>

            {/* Sliders */}
            <div className="space-y-3">
              <AxisSlider label="Base Rotation"   value={state.base}     min={-180} max={180} onChange={(v) => update("base", v)}     icon={<RotateCw className="w-3.5 h-3.5" />} />
              <AxisSlider label="Shoulder Pitch"  value={state.shoulder} min={-90}  max={90}  onChange={(v) => update("shoulder", v)} icon={<ArrowDownUp className="w-3.5 h-3.5" />} />
              <AxisSlider label="Elbow Pitch"     value={state.elbow}    min={-135} max={135} onChange={(v) => update("elbow", v)}    icon={<Move3d className="w-3.5 h-3.5" />} />
              <AxisSlider label="Wrist Pitch"     value={state.wrist}    min={-90}  max={90}  onChange={(v) => update("wrist", v)}    icon={<Settings2 className="w-3.5 h-3.5" />} />
              <AxisSlider label="Camera Axis"     value={state.camera}   min={-180} max={180} onChange={(v) => update("camera", v)}   icon={<Camera className="w-3.5 h-3.5" />} />
              <AxisSlider label="Thermal State"   value={state.temperature} min={20} max={100} unit="°C" onChange={(v) => update("temperature", v)} icon={<Thermometer className="w-3.5 h-3.5" />} />
            </div>
          </div>

          {/* Connection bar */}
          <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-4 flex flex-col md:flex-row gap-3 md:items-center">
            <p className="text-sm text-primary font-mono mb-2 md:mb-0 md:mr-4">Connect to <code className="bg-muted/30 px-1 py-0.5 rounded">wss://hivearm.noreplyglobalx1.workers.dev/ws</code> to enable real‑time control.</p>
            <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-[0.2em] text-muted-foreground shrink-0">
              <Plug className="w-4 h-4 text-primary" /> WebSocket URI
            </div>
            <input
              value={wsUrl}
              onChange={(e) => setWsUrl(e.target.value)}
              disabled={conn !== "disconnected"}
              className="flex-1 bg-input/60 border border-border/60 rounded-md px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-primary/60 disabled:opacity-60"
              placeholder="wss://hivearm.noreplyglobalx1.workers.dev/ws"
            />
            {conn === "disconnected" ? (
              <button onClick={connect} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] text-primary-foreground hover:opacity-90">
                <PlugZap className="w-4 h-4" /> Connect
              </button>
            ) : (
              <button onClick={disconnect} className="inline-flex items-center gap-2 rounded-md border border-destructive/60 text-destructive px-4 py-2 text-xs font-mono uppercase tracking-[0.2em] hover:bg-destructive/10">
                <Power className="w-4 h-4" /> Disconnect
              </button>
            )}
          </div>
        </div>
      </section>

      {/* PIPELINE */}
      <section id="pipeline" className="border-b border-border/60">
        <div className="max-w-[1440px] mx-auto px-6 py-16">
          <SectionHeader
            kicker="02 · Pipeline"
            title="Browser → Servo, in five hops."
            sub="The webpage no longer lives on the ESP32. The board is now strictly WiFi client + WebSocket server + servo driver."
          />
          <div className="mt-10 grid md:grid-cols-5 gap-3">
            {[
              { n: "01", t: "Three.js UI", d: "This browser renders the digital twin and captures slider input." },
              { n: "02", t: "WebSocket", d: "Commands stream as `idx,angle` over ws://host:81." },
              { n: "03", t: "ESP32", d: "Receives string, parses servo & target angle." },
              { n: "04", t: "PCA9685", d: "I²C driver translates angle into PWM pulse width." },
              { n: "05", t: "Servo", d: "moveServoSmooth(idx, target, current, 8) eases to angle." },
            ].map((step, i) => (
              <div key={step.n} className="group relative rounded-xl border border-border/60 bg-card/40 p-5 hover:border-primary/50 hover:bg-card/70 transition">
                <div className="font-mono text-[10px] tracking-[0.3em] text-primary mb-3">{step.n}</div>
                <div className="font-display font-semibold text-base mb-1.5">{step.t}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{step.d}</div>
                {i < 4 && (
                  <div className="hidden md:block absolute top-1/2 -right-2 w-4 h-px bg-primary/40" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TELEMETRY */}
      <section id="telemetry" className="border-b border-border/60">
        <div className="max-w-[1440px] mx-auto px-6 py-16">
          <SectionHeader
            kicker="03 · Telemetry"
            title="Signal log."
            sub="Outbound commands, inbound telemetry, lifecycle events."
          />
          <div className="mt-8 grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 rounded-2xl border border-border/60 bg-card/80 p-5 font-mono text-xs h-80 overflow-y-auto">
              {log.map((l, i) => (
                <div key={i} className="text-muted-foreground hover:text-foreground transition py-0.5">
                  {l}
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <TelemCard icon={<Activity className="w-4 h-4" />} label="Link" value={conn.toUpperCase()} accent={conn === "connected"} />
              <TelemCard icon={<Thermometer className="w-4 h-4" />} label="Thermal" value={`${state.temperature.toFixed(1)}°C`} accent={state.temperature < 70} />
              <TelemCard icon={<Move3d className="w-4 h-4" />} label="Pose vector" value={`${state.base.toFixed(0)}/${state.shoulder.toFixed(0)}/${state.elbow.toFixed(0)}/${state.wrist.toFixed(0)}/${state.camera.toFixed(0)}`} accent />
            </div>
          </div>
        </div>
      </section>

      <footer className="py-10">
        <div className="max-w-[1440px] mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-3">
          <HiveLogo />
          <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
            © {new Date().getFullYear()} HiveArm · Built for the hive
          </div>
        </div>
      </footer>
    </div>
  );
}

function StatusBadge({ conn }: { conn: ConnState }) {
  const map = {
    connected:    { label: "Linked",      cls: "text-primary border-primary/50 bg-primary/10",   Icon: Wifi },
    connecting:   { label: "Linking...",  cls: "text-accent border-accent/50 bg-accent/10",       Icon: Wifi },
    disconnected: { label: "Offline",     cls: "text-muted-foreground border-border bg-muted/30", Icon: WifiOff },
  }[conn];
  const { Icon } = map;
  return (
    <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${map.cls}`}>
      <Icon className="w-3.5 h-3.5" />
      <span className="text-[10px] font-mono uppercase tracking-[0.25em]">{map.label}</span>
    </div>
  );
}

function SectionHeader({ kicker, title, sub }: { kicker: string; title: string; sub: string }) {
  return (
    <div className="max-w-2xl">
      <div className="text-[10px] font-mono uppercase tracking-[0.3em] text-primary mb-3">{kicker}</div>
      <h2 className="font-display text-3xl md:text-4xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm md:text-base text-muted-foreground leading-relaxed">{sub}</p>
    </div>
  );
}

function TempBar({ pct, temp }: { pct: number; temp: number }) {
  return (
    <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-64">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
          <Thermometer className="w-3 h-3" /> Thermal
        </span>
        <span className="text-[10px] font-mono text-primary">{temp.toFixed(1)}°C</span>
      </div>
      <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{
            width: `${pct * 100}%`,
            background: `linear-gradient(90deg, oklch(0.82 0.17 85), oklch(0.65 0.24 25))`,
          }}
        />
      </div>
    </div>
  );
}

function TelemCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-2">
        {icon} {label}
      </div>
      <div className={`font-mono text-lg ${accent ? "text-primary text-glow" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}
