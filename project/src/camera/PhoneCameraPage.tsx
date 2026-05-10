import { useEffect, useRef, useState } from "react";
import { getSocket } from "../socket";

function getRoomFromHash(): string {
  // hash looks like: #phone?room=cam1
  const hash = window.location.hash; // e.g. "#phone?room=cam1"
  const qmark = hash.indexOf("?");
  if (qmark === -1) return "default";
  const params = new URLSearchParams(hash.slice(qmark + 1));
  return params.get("room") || "default";
}

export default function PhoneCameraPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [facing, setFacing] = useState<"user" | "environment">("environment");

  const roomId = getRoomFromHash();

  async function startCamera(facingMode: "user" | "environment" = facing) {
    setStatus("connecting");
    setErrorMsg("");
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const socket = getSocket();
      socket.emit("camera:register", { roomId });

      const canvas = canvasRef.current!;
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d")!;

      intervalRef.current = window.setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const frame = canvas.toDataURL("image/jpeg", 0.55);
        socket.emit("camera:frame", { roomId, frame });
      }, 100);

      setStatus("live");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "No se pudo acceder a la cámara");
      setStatus("error");
    }
  }

  function stopCamera() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStatus("idle");
  }

  function flipCamera() {
    const next: "user" | "environment" = facing === "user" ? "environment" : "user";
    setFacing(next);
    startCamera(next);
  }

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const accent = "#f59e0b";

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", color: "white", fontFamily: "Inter, system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color: accent, marginBottom: 4, letterSpacing: "0.05em" }}>LUMEN LIVE</div>
      <div style={{ fontSize: 11, color: "#555", marginBottom: 24, letterSpacing: 2 }}>CÁMARA MÓVIL · sala: <span style={{ color: "#60a5fa" }}>{roomId}</span></div>

      <div style={{ width: "100%", maxWidth: 440, borderRadius: 18, overflow: "hidden", border: `2px solid ${status === "live" ? "#ef4444" : "#1e1e28"}`, background: "#0f0f15", boxShadow: status === "live" ? "0 0 30px rgba(239,68,68,.35)" : "none", marginBottom: 18, aspectRatio: "16/9", position: "relative" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: status === "live" ? "block" : "none" }} />
        {status !== "live" && (
          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", fontSize: 13 }}>
            {status === "connecting" ? "Iniciando..." : status === "error" ? "Error de cámara" : "Cámara apagada"}
          </div>
        )}
        {status === "live" && (
          <span style={{ position: "absolute", top: 10, left: 10, background: "#ef4444", color: "white", fontSize: 11, fontWeight: 900, padding: "3px 10px", borderRadius: 6, letterSpacing: 1 }}>● EN VIVO</span>
        )}
      </div>

      <canvas ref={canvasRef} style={{ display: "none" }} />

      {errorMsg && (
        <div style={{ background: "#3b0a0a", border: "1px solid #7f1d1d", color: "#f87171", borderRadius: 10, padding: "10px 16px", marginBottom: 14, fontSize: 12, maxWidth: 440, width: "100%", textAlign: "center" }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 20 }}>
        {status !== "live" ? (
          <button onClick={() => startCamera()} style={{ padding: "12px 32px", borderRadius: 12, border: "none", background: accent, color: "#111", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Iniciar cámara
          </button>
        ) : (
          <button onClick={stopCamera} style={{ padding: "12px 28px", borderRadius: 12, border: "1px solid #7f1d1d", background: "#3b0a0a", color: "#f87171", fontWeight: 800, fontSize: 15, cursor: "pointer" }}>
            Detener
          </button>
        )}
        <button onClick={flipCamera} style={{ padding: "12px 20px", borderRadius: 12, border: "1px solid #333", background: "#1c1c22", color: "#ccc", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
          Voltear
        </button>
      </div>

      <div style={{ fontSize: 11, color: "#333", textAlign: "center" }}>
        Mantén esta pantalla abierta mientras transmites
      </div>
    </div>
  );
}
