import { useEffect, useRef, useState } from "react";
import { getSocket, disconnectSocket } from "../socket";

type CameraRoom = {
  id: string;
  label: string;
  frame: string | null;
  online: boolean;
};

type Props = {
  onPreview?: (frame: string) => void;
  onLive?: (frame: string) => void;
};

const DEFAULT_ROOMS: CameraRoom[] = [
  { id: "default", label: "Default",   frame: null, online: false },
  { id: "cam1",    label: "Cámara 1",  frame: null, online: false },
  { id: "cam2",    label: "Cámara 2",  frame: null, online: false },
  { id: "cam3",    label: "Cámara 3",  frame: null, online: false },
  { id: "cam4",    label: "Cámara 4",  frame: null, online: false },
];

export default function CameraPanel({ onPreview, onLive }: Props) {
  const [rooms, setRooms] = useState<CameraRoom[]>(DEFAULT_ROOMS);
  const [connected, setConnected] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("default");
  const [customRoom, setCustomRoom] = useState("");
  const socketRef = useRef(false);

  // Build the phone URL using the current origin + hash params
  function qrUrl(roomId: string) {
    return `${window.location.origin}/#phone?room=${roomId}`;
  }

  useEffect(() => {
    if (socketRef.current) return;
    socketRef.current = true;

    const socket = getSocket();

    function watchAll(roomList: CameraRoom[]) {
      roomList.forEach((r) => socket.emit("camera:watch", { roomId: r.id }));
    }

    socket.on("connect", () => {
      setConnected(true);
      watchAll(DEFAULT_ROOMS);
    });

    socket.on("disconnect", () => setConnected(false));

    socket.on("camera:frame", ({ roomId, frame }: { roomId: string; frame: string }) => {
      setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, frame, online: true } : r));
    });

    socket.on("camera:offline", ({ roomId }: { roomId: string }) => {
      setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, online: false } : r));
    });

    if (socket.connected) {
      setConnected(true);
      watchAll(DEFAULT_ROOMS);
    }

    return () => {
      disconnectSocket();
      socketRef.current = false;
    };
  }, []);

  function addCustomRoom() {
    const id = customRoom.trim().toLowerCase().replace(/\s+/g, "-");
    if (!id || rooms.some((r) => r.id === id)) return;
    const socket = getSocket();
    socket.emit("camera:watch", { roomId: id });
    setRooms((prev) => [...prev, { id, label: customRoom.trim(), frame: null, online: false }]);
    setCustomRoom("");
    setSelectedRoomId(id);
  }

  const S = {
    btn:      { padding: "7px 12px", borderRadius: 8, border: "1px solid #333", background: "#1c1c22", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 700 } as React.CSSProperties,
    btnLive:  { padding: "7px 12px", borderRadius: 8, border: "1px solid #1e3a8a", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 800 } as React.CSSProperties,
    input:    { width: "100%", padding: "8px 12px", background: "#16161c", color: "white", border: "1px solid #2a2a35", borderRadius: 8, fontSize: 13, boxSizing: "border-box" } as React.CSSProperties,
    label:    { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#555", margin: "0 0 10px" },
  };

  const activeRoom = rooms.find((r) => r.id === selectedRoomId);

  return (
    <div>
      {/* Connection status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: connected ? "0 0 8px #22c55e" : "0 0 8px #ef4444" }} />
        <span style={{ fontSize: 12, color: connected ? "#86efac" : "#f87171" }}>
          {connected ? "Socket conectado" : "Conectando al servidor..."}
        </span>
      </div>

      {/* Room selector tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {rooms.map((r) => (
          <button key={r.id} onClick={() => setSelectedRoomId(r.id)}
            style={{ ...S.btn, borderColor: selectedRoomId === r.id ? "#f59e0b" : "#333", color: selectedRoomId === r.id ? "#f59e0b" : r.online ? "#86efac" : "#666" }}>
            {r.label} {r.online ? "●" : "○"}
          </button>
        ))}
      </div>

      {/* Add custom room */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={customRoom} onChange={(e) => setCustomRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustomRoom()} placeholder="Nueva sala..." style={{ ...S.input, flex: 1 }} />
        <button onClick={addCustomRoom} style={S.btn}>+ Sala</button>
      </div>

      {activeRoom && (
        <div>
          {/* Video feed */}
          <div style={{ aspectRatio: "16/9", borderRadius: 14, overflow: "hidden", border: `2px solid ${activeRoom.online ? "#ef4444" : "#1e1e28"}`, background: "#050505", marginBottom: 14, position: "relative", boxShadow: activeRoom.online ? "0 0 20px rgba(239,68,68,.3)" : "none" }}>
            {activeRoom.frame ? (
              <img src={activeRoom.frame} alt="camera feed" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#2a2a35", fontSize: 13, flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 32 }}>📷</div>
                <div style={{ textAlign: "center" }}>{activeRoom.online ? "Recibiendo señal..." : "Sin señal · Abre el enlace en tu móvil"}</div>
              </div>
            )}
            {activeRoom.online && (
              <div style={{ position: "absolute", top: 10, left: 10, background: "#ef4444", color: "white", fontSize: 11, fontWeight: 900, padding: "3px 8px", borderRadius: 5, letterSpacing: 1 }}>
                ● EN VIVO
              </div>
            )}
          </div>

          {/* Action buttons */}
          {activeRoom.frame && (
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {onPreview && <button onClick={() => onPreview(activeRoom.frame!)} style={{ ...S.btn, flex: 1 }}>Preview</button>}
              {onLive && <button onClick={() => onLive(activeRoom.frame!)} style={{ ...S.btnLive, flex: 1 }}>LIVE</button>}
            </div>
          )}

          {/* Connection instructions */}
          <div style={{ background: "#0f0f15", border: "1px solid #1e1e28", borderRadius: 12, padding: 16 }}>
            <p style={S.label}>CONECTAR CÁMARA MÓVIL</p>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.75, marginBottom: 12 }}>
              Abre este enlace en tu teléfono (misma red WiFi o por datos):
            </div>
            <div style={{ background: "#16161c", borderRadius: 8, padding: "10px 14px", wordBreak: "break-all", fontSize: 12, color: "#60a5fa", marginBottom: 12, border: "1px solid #2a2a35", userSelect: "all" }}>
              {qrUrl(activeRoom.id)}
            </div>
            <button onClick={() => navigator.clipboard.writeText(qrUrl(activeRoom.id))} style={{ ...S.btn, width: "100%", textAlign: "center" }}>
              Copiar enlace
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
