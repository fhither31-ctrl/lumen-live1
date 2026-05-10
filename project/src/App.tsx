import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from "react";
import PhoneCameraPage from "./camera/PhoneCameraPage";
import CameraPanel from "./camera/CameraPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

type CatalogBible = { id: string; name: string; language: string; abbreviation: string; license: string; file: string; };
type BibleBook = { name: string; chapters: string[][]; };
type BibleData = { metadata: { name: string; abbreviation: string; language: string }; books: BibleBook[]; };

type Slide = { type: "bible" | "song"; title: string; label: string; text: string; };
type Song = { id: string; title: string; author: string; slides: Slide[]; };
type Theme = { id: string; name: string; bg: string; text: string; accent: string; };

type MediaAsset = {
  id: string;
  name: string;
  type: "image" | "video";
  dataUrl: string;
  createdAt: string;
};

type PlaylistItem = Song | MediaAsset;
type SlideMediaMap = Record<string, MediaAsset>;

type LiveState = {
  liveSlide: Slide | null;
  liveMedia: MediaAsset | null;
  themeId: string;
  bgId: string;
  customBg: string;
  lowerThird: boolean;
  blackout: boolean;
  logo: boolean;
  logoText: string;
  fontScale: number;
  showClock: boolean;
};

// ─── Storage ──────────────────────────────────────────────────────────────────

const SONGS_KEY = "lumen-songs-v10";
const PLAYLIST_KEY = "lumen-playlist-v13";
const MEDIA_KEY = "lumen-media-v3";
const SLIDE_MEDIA_KEY = "lumen-slide-media-v1";
const LIVE_STATE_KEY = "lumen-live-state-v13";
const THEME_KEY = "lumen-theme-v10";
const BG_KEY = "lumen-bg-v10";
const CUSTOM_BG_KEY = "lumen-custom-bg-v10";
const LOGO_TEXT_KEY = "lumen-logo-text-v10";
const FONT_SCALE_KEY = "lumen-font-scale-v10";

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === 0 && Array.isArray(fallback) && (fallback as unknown[]).length > 0) return fallback;
    return parsed || fallback;
  } catch {
    return fallback;
  }
}

function safePersistPlaylist(playlist: PlaylistItem[]) {
  try { localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist)); } catch { /* quota */ }
}

function safePersistMedia(media: MediaAsset[]) {
  try { localStorage.setItem(MEDIA_KEY, JSON.stringify(media)); } catch { /* quota */ }
}

function safePersistSlideMedia(map: SlideMediaMap) {
  try { localStorage.setItem(SLIDE_MEDIA_KEY, JSON.stringify(map)); } catch { /* quota */ }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const THEMES: Theme[] = [
  { id: "blue",  name: "Worship", bg: "linear-gradient(135deg,#0f766e,#1d4ed8)",        text: "#fff",     accent: "#f59e0b" },
  { id: "fire",  name: "Fuego",   bg: "linear-gradient(135deg,#7c2d12,#991b1b,#312e81)", text: "#fff",     accent: "#fb923c" },
  { id: "royal", name: "Royal",   bg: "linear-gradient(135deg,#1e1b4b,#581c87,#0f172a)", text: "#fff",     accent: "#c084fc" },
  { id: "clean", name: "Claro",   bg: "linear-gradient(135deg,#f8fafc,#e2e8f0)",         text: "#111827",  accent: "#2563eb" },
  { id: "black", name: "Negro",   bg: "#000",                                             text: "#fff",     accent: "#f59e0b" },
];

const BACKGROUNDS = [
  { id: "none",   name: "Tema",    value: "" },
  { id: "blue",   name: "Azul",    value: "linear-gradient(135deg,#075985,#1d4ed8)" },
  { id: "gold",   name: "Dorado",  value: "linear-gradient(135deg,#78350f,#f59e0b)" },
  { id: "purple", name: "Púrpura", value: "linear-gradient(135deg,#312e81,#7e22ce)" },
  { id: "green",  name: "Verde",   value: "linear-gradient(135deg,#064e3b,#0f766e)" },
  { id: "dark",   name: "Oscuro",  value: "linear-gradient(135deg,#020617,#18181b)" },
  { id: "image",  name: "Imagen",  value: "image" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

function getClock() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function makeBibleSlide(ref: string, text: string): Slide {
  return { type: "bible", title: ref, label: ref, text };
}

function slideKey(slide: Slide) {
  return `${slide.type}::${slide.title}::${slide.label}::${slide.text}`;
}

function getTextSize(text = "") {
  if (text.length > 220) return 34;
  if (text.length > 160) return 42;
  if (text.length > 100) return 52;
  return 68;
}

function splitSongLyrics(title: string, lyrics: string): Slide[] {
  const normalized = lyrics.replace(/\r/g, "").replace(/[""]/g, '"').replace(/['']/g, "'").trim();
  const blocks = normalized.split(/\n\s*\n/g).map((b) => b.trim()).filter(Boolean);
  const finalBlocks: string[] = [];
  blocks.forEach((block) => {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length; i += 4) finalBlocks.push(lines.slice(i, i + 4).join("\n"));
  });
  return finalBlocks.map((text, i) => ({ type: "song", title, label: `${title} ${i + 1}`, text }));
}

const DEFAULT_SONGS: Song[] = [
  {
    id: "demo-adoracion",
    title: "Demo Adoración",
    author: "Lumen Live",
    slides: splitSongLyrics("Demo Adoración", `Estamos aquí
Con el corazón abierto
Levantamos nuestra voz
Y esperamos en Ti

Tu presencia llena este lugar
Tu luz nos guía al caminar
Hoy rendimos todo a Ti
Con gratitud y adoración

Ven y toma tu lugar
Haz tu voluntad
Que tu gloria brille hoy
En nuestra reunión`),
  },
];

function isSongItem(item: PlaylistItem): item is Song {
  return "slides" in item;
}

function isMediaItem(item: PlaylistItem): item is MediaAsset {
  return "dataUrl" in item;
}

// ─── LiveMediaLayer ───────────────────────────────────────────────────────────

function LiveMediaLayer({ media }: { media: MediaAsset | null }) {
  if (!media) return null;
  if (media.type === "video") {
    return (
      <video src={media.dataUrl} autoPlay loop muted playsInline
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", zIndex: 0 }} />
    );
  }
  return (
    <div style={{ position: "absolute", inset: 0, background: `url(${media.dataUrl}) center/cover no-repeat`, zIndex: 0 }} />
  );
}

// ─── LiveSlide ────────────────────────────────────────────────────────────────

function LiveSlide({
  slide, theme, bg, customBg, lowerThird = false, small = false, fontScale = 1, showClock = false, media = null,
}: {
  slide: Slide | null; theme: Theme; bg: string; customBg: string;
  lowerThird?: boolean; small?: boolean; fontScale?: number; showClock?: boolean;
  media?: MediaAsset | null;
}) {
  const [clock, setClock] = useState(getClock());
  useEffect(() => {
    const id = setInterval(() => setClock(getClock()), 1000);
    return () => clearInterval(id);
  }, []);

  const imageBg = bg === "image" && customBg;
  const background = media ? "#000" : imageBg ? `url(${customBg}) center/cover no-repeat` : bg || theme.bg;
  const baseSize = slide ? getTextSize(slide.text) * fontScale : 34;
  const size = small ? Math.max(9, baseSize * 0.34) : baseSize;

  return (
    <div className="live-fade" style={{
      width: "100%", height: "100%", borderRadius: small ? 12 : 0,
      background, color: theme.text, display: "flex", alignItems: "center",
      justifyContent: "center", textAlign: "center",
      padding: small ? 8 : 80, position: "relative", overflow: "hidden",
      boxSizing: "border-box", transition: "all .25s ease",
    }}>
      <LiveMediaLayer media={media} />

      <div style={{
        position: "absolute", inset: 0, zIndex: 1,
        background: media
          ? "linear-gradient(rgba(0,0,0,.28),rgba(0,0,0,.52))"
          : imageBg
          ? "linear-gradient(rgba(0,0,0,.48),rgba(0,0,0,.58))"
          : "radial-gradient(circle at top left,rgba(255,255,255,.16),transparent 35%),radial-gradient(circle at bottom right,rgba(0,0,0,.30),transparent 45%)",
      }} />

      {showClock && (
        <div style={{ position: "absolute", top: small ? 12 : 34, right: small ? 14 : 48, zIndex: 5, fontSize: small ? 10 : 22, opacity: 0.75, fontWeight: 700 }}>
          {clock}
        </div>
      )}

      {slide ? (
        <>
          {!lowerThird && (
            <div style={{ position: "relative", zIndex: 2, maxWidth: "90%" }}>
              {slide.type === "bible" && !small && (
                <div style={{ fontSize: 27, opacity: 0.78, marginBottom: 30, letterSpacing: 1.5, fontWeight: 700 }}>
                  {slide.label}
                </div>
              )}
              <div style={{
                fontSize: size, lineHeight: 1.22, fontWeight: 900, whiteSpace: "pre-line",
                textShadow: theme.id === "clean" ? "none" : "0 5px 18px rgba(0,0,0,.55)",
              }}>
                {slide.text}
              </div>
              {slide.type === "song" && !small && (
                <div style={{ fontSize: 22, opacity: 0.55, marginTop: 24, fontWeight: 600 }}>{slide.title}</div>
              )}
            </div>
          )}
          {lowerThird && (
            <div style={{
              position: "absolute", left: small ? 22 : 80, right: small ? 22 : 80, bottom: small ? 28 : 70,
              padding: small ? "12px 16px" : "26px 34px", borderRadius: 16,
              background: "rgba(0,0,0,.66)", backdropFilter: "blur(10px)",
              color: "white", textAlign: "left", fontSize: small ? 13 : 26, zIndex: 3,
            }}>
              <strong>{slide.label}</strong> · {slide.text}
            </div>
          )}
        </>
      ) : (
        <div style={{ opacity: 0.25, fontSize: small ? 14 : 54, fontWeight: 800, zIndex: 2, position: "relative", letterSpacing: 2 }}>LIVE</div>
      )}
    </div>
  );
}

// ─── OutputScreen ─────────────────────────────────────────────────────────────

function OutputScreen() {
  const defaultState: LiveState = {
    liveSlide: null, liveMedia: null, themeId: "blue", bgId: "none", customBg: "",
    lowerThird: false, blackout: false, logo: false, logoText: "Lumen Live", fontScale: 1, showClock: false,
  };

  const [state, setState] = useState<LiveState>(() => loadJson(LIVE_STATE_KEY, defaultState));

  useEffect(() => {
    const id = setInterval(() => setState(loadJson(LIVE_STATE_KEY, defaultState)), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);

  const theme = THEMES.find((t) => t.id === state.themeId) || THEMES[0];
  const bgValue = BACKGROUNDS.find((b) => b.id === state.bgId)?.value || "";

  if (state.blackout) return <div style={{ width: "100vw", height: "100vh", background: "#000" }} />;

  if (state.logo) {
    return (
      <div style={{ width: "100vw", height: "100vh", background: "radial-gradient(circle at center,#111827,#000)", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 90, fontWeight: 900 }}>
        {state.logoText || "Lumen Live"}
      </div>
    );
  }

  return (
    <div style={{ width: "100vw", height: "100vh", background: "radial-gradient(circle at center,#111827,#000)" }}>
      <LiveSlide slide={state.liveSlide} media={state.liveMedia} theme={theme} bg={bgValue} customBg={state.customBg} lowerThird={state.lowerThird} fontScale={state.fontScale} showClock={state.showClock} />
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const isOutput = window.location.hash === "#output";
  const bgFileRef = useRef<HTMLInputElement | null>(null);
  const mediaFileRef = useRef<HTMLInputElement | null>(null);
  const importRef = useRef<HTMLInputElement | null>(null);

  const [contentTab, setContentTab] = useState<"bible" | "songs" | "media" | "cameras" | "themes">("songs");
  const [mediaTab, setMediaTab] = useState<"images" | "videos">("images");

  const [catalog, setCatalog] = useState<CatalogBible[]>([]);
  const [activeCatalog, setActiveCatalog] = useState<CatalogBible | null>(null);
  const [bible, setBible] = useState<BibleData | null>(null);
  const [bookIndex, setBookIndex] = useState(0);
  const [chapterIndex, setChapterIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [selectedSlide, setSelectedSlide] = useState<Slide | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<MediaAsset | null>(null);

  const [songs, setSongs] = useState<Song[]>(() => loadJson(SONGS_KEY, DEFAULT_SONGS));
  const [songTitle, setSongTitle] = useState("");
  const [songAuthor, setSongAuthor] = useState("");
  const [songLyrics, setSongLyrics] = useState("");
  const [editingSongId, setEditingSongId] = useState<string | null>(null);

  const [playlist, setPlaylist] = useState<PlaylistItem[]>(() => loadJson(PLAYLIST_KEY, []));
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>(() =>
    loadJson<MediaAsset[]>(MEDIA_KEY, []).filter((a) => a.type === "image")
  );
  const [slideMediaMap, setSlideMediaMap] = useState<SlideMediaMap>(() => loadJson(SLIDE_MEDIA_KEY, {}));
  const [liveIndex, setLiveIndex] = useState<number | null>(null);
  const [liveSlide, setLiveSlide] = useState<Slide | null>(null);
  const [liveMedia, setLiveMedia] = useState<MediaAsset | null>(null);

  const [themeId, setThemeId] = useState(() => localStorage.getItem(THEME_KEY) || "blue");
  const [bgId, setBgId] = useState(() => localStorage.getItem(BG_KEY) || "none");
  const [customBg, setCustomBg] = useState(() => localStorage.getItem(CUSTOM_BG_KEY) || "");
  const [lowerThird, setLowerThird] = useState(false);
  const [blackout, setBlackout] = useState(false);
  const [logo, setLogo] = useState(false);
  const [logoText, setLogoText] = useState(() => localStorage.getItem(LOGO_TEXT_KEY) || "Lumen Live");
  const [fontScale, setFontScale] = useState(() => Number(localStorage.getItem(FONT_SCALE_KEY)) || 1);
  const [showClock, setShowClock] = useState(false);

  const [deckSong, setDeckSong] = useState<Song | null>(null);
  const [deckSource, setDeckSource] = useState<"bible" | "song">("song");

  const theme = THEMES.find((t) => t.id === themeId) || THEMES[0];
  const bgValue = BACKGROUNDS.find((b) => b.id === bgId)?.value || "";
  const imageAssets = mediaAssets.filter((a) => a.type === "image");
  const videoAssets = mediaAssets.filter((a) => a.type === "video");

  // ── Init first deck ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!deckSong && songs.length > 0) {
      setDeckSong(songs[0]);
      setDeckSource("song");
      const first = songs[0].slides[0] || null;
      setSelectedSlide(first);
      setSelectedMedia(first ? slideMediaMap[slideKey(first)] || null : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs]);

  // ── Persistence ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOutput) return;
    localStorage.setItem(LIVE_STATE_KEY, JSON.stringify({ liveSlide, liveMedia, themeId, bgId, customBg, lowerThird, blackout, logo, logoText, fontScale, showClock }));
  }, [isOutput, liveSlide, liveMedia, themeId, bgId, customBg, lowerThird, blackout, logo, logoText, fontScale, showClock]);

  useEffect(() => localStorage.setItem(SONGS_KEY, JSON.stringify(songs)), [songs]);
  useEffect(() => safePersistPlaylist(playlist), [playlist]);
  useEffect(() => safePersistMedia(mediaAssets), [mediaAssets]);
  useEffect(() => safePersistSlideMedia(slideMediaMap), [slideMediaMap]);
  useEffect(() => localStorage.setItem(THEME_KEY, themeId), [themeId]);
  useEffect(() => localStorage.setItem(BG_KEY, bgId), [bgId]);
  useEffect(() => localStorage.setItem(CUSTOM_BG_KEY, customBg), [customBg]);
  useEffect(() => localStorage.setItem(LOGO_TEXT_KEY, logoText), [logoText]);
  useEffect(() => localStorage.setItem(FONT_SCALE_KEY, String(fontScale)), [fontScale]);

  // ── Bible loading ─────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/bibles/catalog.json").then((r) => r.json()).then((data) => {
      const list = data.bibles || [];
      setCatalog(list);
      setActiveCatalog(list[0] || null);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    if (!activeCatalog?.file) return;
    fetch(activeCatalog.file).then((r) => r.json()).then((data) => {
      setBible(data); setBookIndex(0); setChapterIndex(0);
    }).catch(console.error);
  }, [activeCatalog]);

  const books = bible?.books || [];
  const currentBook = books[bookIndex];
  const chapters = currentBook?.chapters || [];
  const verses = chapters[chapterIndex] || [];

  const searchResults = useMemo(() => {
    if (!bible || !query.trim()) return [];
    const q = query.toLowerCase();
    const results: Slide[] = [];
    bible.books.forEach((book) => {
      book.chapters.forEach((chapter, ci) => {
        chapter.forEach((text, vi) => {
          const ref = `${book.name} ${ci + 1}:${vi + 1}`;
          if (text.toLowerCase().includes(q) || ref.toLowerCase().includes(q)) results.push(makeBibleSlide(ref, text));
        });
      });
    });
    return results;
  }, [bible, query]);

  const deckSlides = useMemo(() => {
    if (deckSource === "song" && deckSong) return deckSong.slides;
    if (query) return searchResults;
    return verses.map((t, i) => makeBibleSlide(`${currentBook?.name} ${chapterIndex + 1}:${i + 1}`, t));
  }, [deckSource, deckSong, query, searchResults, verses, currentBook, chapterIndex]);

  // ── Slide / media actions ─────────────────────────────────────────────────────

  function selectSlideForPreview(slide: Slide) {
    setSelectedSlide(slide);
    setSelectedMedia(slideMediaMap[slideKey(slide)] || null);
  }

  function assignMediaToSlide(slide: Slide, asset: MediaAsset) {
    setSlideMediaMap((prev) => ({ ...prev, [slideKey(slide)]: asset }));
    setSelectedSlide(slide);
    setSelectedMedia(asset);
  }

  function removeMediaFromSlide(slide: Slide) {
    const key = slideKey(slide);
    setSlideMediaMap((prev) => { const next = { ...prev }; delete next[key]; return next; });
    if (selectedSlide && slideKey(selectedSlide) === key) setSelectedMedia(null);
  }

  function loadSongToDeck(song: Song, goLive = false) {
    setDeckSource("song");
    setDeckSong(song);
    setContentTab("songs");
    setQuery("");
    const firstSlide = song.slides[0] || null;
    setSelectedSlide(firstSlide);
    setSelectedMedia(firstSlide ? slideMediaMap[slideKey(firstSlide)] || null : null);
    if (goLive && firstSlide) {
      setLiveSlide(firstSlide);
      const media = slideMediaMap[slideKey(firstSlide)];
      if (media) setLiveMedia(media);
      setLiveIndex(0);
      setBlackout(false);
      setLogo(false);
    }
  }

  function sendDirectToLive(slide: Slide) {
    setLiveSlide(slide);
    const assignedMedia = slideMediaMap[slideKey(slide)];
    if (assignedMedia) setLiveMedia(assignedMedia);
    const idx = deckSlides.findIndex((s) => s.label === slide.label && s.text === slide.text);
    setLiveIndex(idx >= 0 ? idx : null);
    setBlackout(false);
    setLogo(false);
  }

  function sendMediaToLive(asset: MediaAsset) {
    setLiveMedia(asset);
    setBlackout(false);
    setLogo(false);
  }

  function selectMediaForPreview(asset: MediaAsset) {
    setSelectedMedia(asset);
  }

  function sendPreviewToLive() {
    if (selectedSlide) {
      setLiveSlide(selectedSlide);
      const idx = deckSlides.findIndex((s) => s.label === selectedSlide.label && s.text === selectedSlide.text);
      setLiveIndex(idx >= 0 ? idx : null);
    }
    if (selectedMedia) setLiveMedia(selectedMedia);
    setBlackout(false);
    setLogo(false);
  }

  function nextLive() {
    if (!deckSlides.length) return;
    const currentIndex = liveIndex ?? deckSlides.findIndex((s) => liveSlide?.label === s.label && liveSlide?.text === s.text);
    const nextIndex = Math.min((currentIndex < 0 ? 0 : currentIndex + 1), deckSlides.length - 1);
    const nextSlide = deckSlides[nextIndex];
    const assignedMedia = slideMediaMap[slideKey(nextSlide)];
    setLiveSlide(nextSlide);
    if (assignedMedia) setLiveMedia(assignedMedia);
    setSelectedSlide(nextSlide);
    setSelectedMedia(assignedMedia || null);
    setLiveIndex(nextIndex);
    setBlackout(false);
    setLogo(false);
  }

  function prevLive() {
    if (!deckSlides.length) return;
    const currentIndex = liveIndex ?? deckSlides.findIndex((s) => liveSlide?.label === s.label && liveSlide?.text === s.text);
    const prevIndex = Math.max((currentIndex < 0 ? 0 : currentIndex - 1), 0);
    const prevSlide = deckSlides[prevIndex];
    const assignedMedia = slideMediaMap[slideKey(prevSlide)];
    setLiveSlide(prevSlide);
    if (assignedMedia) setLiveMedia(assignedMedia);
    setSelectedSlide(prevSlide);
    setSelectedMedia(assignedMedia || null);
    setLiveIndex(prevIndex);
    setBlackout(false);
    setLogo(false);
  }

  function addSelectedToPlaylist() {
    if (selectedMedia) return addMediaToPlaylist(selectedMedia);
    if (!selectedSlide || selectedSlide.type !== "song" || !deckSong) return;
    addSongToPlaylist(deckSong);
  }

  function addSongToPlaylist(song: Song) {
    if (!playlist.some((item) => item.id === song.id)) setPlaylist((prev) => [...prev, song]);
  }

  function addMediaToPlaylist(asset: MediaAsset) {
    if (!playlist.some((item) => item.id === asset.id)) setPlaylist((prev) => [...prev, asset]);
  }

  function sendPlaylistItemToLive(index: number) {
    const item = playlist[index];
    if (!item) return;
    if (isMediaItem(item)) return sendMediaToLive(item);
    if (isSongItem(item) && item.slides.length) loadSongToDeck(item, true);
  }

  function loadPlaylistItemToPreview(index: number) {
    const item = playlist[index];
    if (!item) return;
    if (isMediaItem(item)) return selectMediaForPreview(item);
    loadSongToDeck(item as Song);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────────

  function handleMediaDragStart(e: DragEvent<HTMLDivElement>, asset: MediaAsset) {
    e.dataTransfer.setData("lumen/media-id", asset.id);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleDropMediaToPlaylist(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    const mediaId = e.dataTransfer.getData("lumen/media-id");
    const asset = mediaAssets.find((m) => m.id === mediaId);
    if (asset) addMediaToPlaylist(asset);
  }

  function handleDropMediaToOneSlide(e: DragEvent<HTMLDivElement>, slide: Slide) {
    e.preventDefault();
    e.stopPropagation();
    const mediaId = e.dataTransfer.getData("lumen/media-id");
    const asset = mediaAssets.find((m) => m.id === mediaId);
    if (asset) assignMediaToSlide(slide, asset);
  }

  function allowMediaDrop(e: DragEvent<HTMLElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  // ── Playlist management ───────────────────────────────────────────────────────

  function removePlaylistItem(index: number) {
    const removed = playlist[index];
    setPlaylist((prev) => prev.filter((_, i) => i !== index));
    if (removed && isMediaItem(removed)) {
      if (selectedMedia?.id === removed.id) setSelectedMedia(null);
      if (liveMedia?.id === removed.id) setLiveMedia(null);
      return;
    }
    if (removed && isSongItem(removed) && deckSong?.id === removed.id) {
      setDeckSong(songs[0] || null);
      setDeckSource(songs[0] ? "song" : "bible");
      setSelectedSlide(songs[0]?.slides[0] || null);
      setLiveIndex(null);
    }
  }

  function movePlaylistItem(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= playlist.length) return;
    setPlaylist((prev) => {
      const n = [...prev]; [n[index], n[target]] = [n[target], n[index]]; return n;
    });
  }

  // ── Song management ───────────────────────────────────────────────────────────

  function clearSongForm() { setSongTitle(""); setSongAuthor(""); setSongLyrics(""); setEditingSongId(null); }

  function startEditSong(song: Song) {
    setSongTitle(song.title);
    setSongAuthor(song.author);
    setSongLyrics(song.slides.map((s) => s.text).join("\n\n"));
    setEditingSongId(song.id);
    setContentTab("songs");
  }

  function saveSong() {
    const title = songTitle.trim();
    const lyrics = songLyrics.trim();
    if (!title || !lyrics) return;
    if (editingSongId) {
      const updated: Song = { id: editingSongId, title, author: songAuthor.trim(), slides: splitSongLyrics(title, lyrics) };
      setSongs((prev) => prev.map((s) => (s.id === editingSongId ? updated : s)));
      setPlaylist((prev) => prev.map((item) => (isSongItem(item) && item.id === editingSongId ? updated : item)));
      if (deckSong?.id === editingSongId) setDeckSong(updated);
    } else {
      setSongs((prev) => [{ id: uid(), title, author: songAuthor.trim(), slides: splitSongLyrics(title, lyrics) }, ...prev]);
    }
    clearSongForm();
  }

  function deleteSong(id: string) {
    setSongs((prev) => { const next = prev.filter((s) => s.id !== id); return next.length === 0 ? DEFAULT_SONGS : next; });
    setPlaylist((prev) => prev.filter((item) => item.id !== id));
    if (deckSong?.id === id) { setDeckSong(null); setSelectedSlide(null); setLiveIndex(null); }
    if (editingSongId === id) clearSongForm();
  }

  // ── Export / Import ───────────────────────────────────────────────────────────

  function openOutput() {
    window.open(`${window.location.origin}/#output`, "_blank", "noopener,noreferrer");
  }

  function fullscreen() { document.documentElement.requestFullscreen?.(); }

  function exportService() {
    const blob = new Blob([JSON.stringify({ version: 14, playlist, songs, mediaAssets: imageAssets, slideMediaMap, themeId, bgId, customBg, logoText, fontScale, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `lumen-service-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importService(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data.songs) && data.songs.length) setSongs(data.songs);
        if (Array.isArray(data.playlist)) setPlaylist(data.playlist);
        if (Array.isArray(data.mediaAssets)) setMediaAssets(data.mediaAssets);
        if (data.slideMediaMap) setSlideMediaMap(data.slideMediaMap);
        if (data.themeId) setThemeId(data.themeId);
        if (data.bgId) setBgId(data.bgId);
        if (data.customBg) setCustomBg(data.customBg);
        if (data.logoText) setLogoText(data.logoText);
        if (data.fontScale) setFontScale(Number(data.fontScale));
      } catch { alert("Archivo no válido."); }
    };
    reader.readAsText(file);
  }

  function uploadBackground(file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { setCustomBg(String(reader.result)); setBgId("image"); };
    reader.readAsDataURL(file);
  }

  function uploadMediaFile(file?: File) {
    if (!file) return;
    const actualType: "image" | "video" = file.type.startsWith("video/") ? "video" : "image";
    const expectedType = mediaTab === "images" ? "image" : "video";
    if (expectedType !== actualType) {
      alert(mediaTab === "images" ? "Selecciona una imagen." : "Selecciona un video.");
      if (mediaFileRef.current) mediaFileRef.current.value = "";
      return;
    }
    if (actualType === "video") {
      const asset: MediaAsset = { id: uid(), name: file.name.replace(/\.[^/.]+$/, ""), type: "video", dataUrl: URL.createObjectURL(file), createdAt: new Date().toISOString() };
      setMediaAssets((prev) => [asset, ...prev]);
      setContentTab("media"); setMediaTab("videos");
      if (mediaFileRef.current) mediaFileRef.current.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const asset: MediaAsset = { id: uid(), name: file.name.replace(/\.[^/.]+$/, ""), type: "image", dataUrl: String(reader.result), createdAt: new Date().toISOString() };
      setMediaAssets((prev) => [asset, ...prev]);
      setContentTab("media"); setMediaTab("images");
      if (mediaFileRef.current) mediaFileRef.current.value = "";
    };
    reader.onerror = () => alert("No se pudo cargar el archivo.");
    reader.readAsDataURL(file);
  }

  function deleteMediaAsset(id: string) {
    setMediaAssets((prev) => prev.filter((a) => a.id !== id));
    setPlaylist((prev) => prev.filter((item) => item.id !== id));
    setSlideMediaMap((prev) => {
      const next: SlideMediaMap = {};
      Object.entries(prev).forEach(([key, asset]) => { if (asset.id !== id) next[key] = asset; });
      return next;
    });
    if (selectedMedia?.id === id) setSelectedMedia(null);
    if (liveMedia?.id === id) setLiveMedia(null);
  }

  function clearOnlyLyrics() {
    setLiveSlide(null); setLiveIndex(null); setBlackout(false); setLogo(false);
  }

  function clearAllLive() {
    setLiveSlide(null); setLiveMedia(null); setLiveIndex(null); setBlackout(false); setLogo(false);
  }

  // ── Keyboard shortcuts ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      if (e.key === "ArrowRight" || e.key === " ") { e.preventDefault(); nextLive(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prevLive(); }
      if (e.key === "Enter") { e.preventDefault(); sendPreviewToLive(); }
      if (e.key === "Escape") { e.preventDefault(); clearOnlyLyrics(); }
      if (e.key.toLowerCase() === "a") { e.preventDefault(); addSelectedToPlaylist(); }
      if (e.key.toLowerCase() === "c") { e.preventDefault(); clearOnlyLyrics(); }
      if (e.key.toLowerCase() === "x") { e.preventDefault(); clearAllLive(); }
      if (e.key.toLowerCase() === "b") { e.preventDefault(); setBlackout((v) => !v); setLogo(false); }
      if (e.key.toLowerCase() === "l") { e.preventDefault(); setLogo((v) => !v); setBlackout(false); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [selectedSlide, selectedMedia, deckSlides, liveIndex, liveSlide, liveMedia, slideMediaMap]);

  const isPhone = window.location.hash === "#phone" || window.location.hash.startsWith("#phone?");

  if (isOutput) return <OutputScreen />;
  if (isPhone) return <PhoneCameraPage />;

  // ── Styles ────────────────────────────────────────────────────────────────────
  const S: Record<string, CSSProperties> = {
    btn:       { padding: "7px 13px", borderRadius: 8, border: "1px solid #333", background: "#1c1c22", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 700 },
    btnAccent: { padding: "8px 16px", borderRadius: 9, border: "none", background: "#f59e0b", color: "#111", cursor: "pointer", fontSize: 13, fontWeight: 800 },
    btnDanger: { padding: "7px 12px", borderRadius: 8, border: "1px solid #7f1d1d", background: "#3b0a0a", color: "#f87171", cursor: "pointer", fontSize: 12, fontWeight: 700 },
    btnLive:   { padding: "7px 13px", borderRadius: 8, border: "1px solid #1e3a8a", background: "#1d4ed8", color: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 800 },
    btnGreen:  { padding: "7px 13px", borderRadius: 8, border: "1px solid #065f46", background: "#064e3b", color: "#6ee7b7", cursor: "pointer", fontSize: 12, fontWeight: 700 },
    input:     { width: "100%", padding: "9px 12px", marginBottom: 10, background: "#16161c", color: "white", border: "1px solid #2a2a35", borderRadius: 9, fontSize: 14, boxSizing: "border-box" },
    textarea:  { width: "100%", minHeight: 90, padding: "9px 12px", marginBottom: 10, background: "#16161c", color: "white", border: "1px solid #2a2a35", borderRadius: 9, fontSize: 14, boxSizing: "border-box", resize: "vertical" },
    select:    { padding: "8px 11px", background: "#16161c", color: "white", border: "1px solid #2a2a35", borderRadius: 9, fontSize: 13 },
    label:     { fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" as const, color: "#555", margin: "0 0 10px" },
  };

  const tabStyle = (active: boolean): CSSProperties => ({
    padding: "6px 14px", borderRadius: 8,
    border: active ? `1px solid ${theme.accent}` : "1px solid transparent",
    background: active ? "rgba(255,255,255,.05)" : "transparent",
    color: active ? theme.accent : "#666",
    cursor: "pointer", fontSize: 13, fontWeight: 700,
  });

  const mediaTabStyle = (active: boolean): CSSProperties => ({
    ...S.btn, borderColor: active ? theme.accent : "#333", color: active ? theme.accent : "#aaa",
  });

  function renderMediaCard(asset: MediaAsset) {
    const isSelected = selectedMedia?.id === asset.id;
    const isLive = liveMedia?.id === asset.id;
    return (
      <div key={asset.id} draggable onDragStart={(e) => handleMediaDragStart(e, asset)}
        style={{ border: isSelected || isLive ? `2px solid ${isLive ? "#ef4444" : theme.accent}` : "1px solid #1e1e28", background: "#111116", borderRadius: 12, overflow: "hidden" }}>
        <div onClick={() => selectMediaForPreview(asset)} onDoubleClick={() => sendMediaToLive(asset)}
          style={{ aspectRatio: "16/9", background: asset.type === "image" ? `url(${asset.dataUrl}) center/cover no-repeat` : "#050505", cursor: "grab", position: "relative", overflow: "hidden" }}>
          {asset.type === "video" && <video src={asset.dataUrl} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          <span style={{ position: "absolute", top: 8, left: 8, background: asset.type === "image" ? "#064e3b" : "#1d4ed8", color: "white", fontSize: 10, fontWeight: 900, padding: "3px 6px", borderRadius: 6 }}>
            {asset.type === "image" ? "IMAGEN" : "VIDEO"}
          </span>
          {isLive && <span style={{ position: "absolute", top: 8, right: 8, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 900, padding: "3px 6px", borderRadius: 6 }}>LIVE</span>}
        </div>
        <div style={{ padding: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "#ddd", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{asset.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => selectMediaForPreview(asset)} style={{ ...S.btnGreen, padding: "5px 8px", fontSize: 11 }}>Preview</button>
            <button onClick={() => sendMediaToLive(asset)} style={{ ...S.btnLive, padding: "5px 8px", fontSize: 11 }}>LIVE</button>
            <button onClick={() => addMediaToPlaylist(asset)} style={{ ...S.btn, padding: "5px 8px", fontSize: 11 }}>+ Playlist</button>
            <button onClick={() => deleteMediaAsset(asset.id)} style={{ ...S.btnDanger, padding: "5px 8px", fontSize: 11 }}>✕</button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#0a0a0e", color: "white", height: "100vh", display: "grid", gridTemplateColumns: "280px minmax(500px,1fr) 360px", gridTemplateRows: "44px 1fr", fontFamily: "Inter, system-ui, sans-serif", overflow: "hidden" }}>
      <style>{`
        .live-fade { animation: lfade .25s ease-out; }
        @keyframes lfade { from { opacity:.35; transform:scale(.98); } to { opacity:1; transform:scale(1); } }
        ::-webkit-scrollbar { width:5px; height:5px; }
        ::-webkit-scrollbar-track { background:#111; }
        ::-webkit-scrollbar-thumb { background:#333; border-radius:99px; }
        .slide-card:hover { background:#1e1e28 !important; border-color:#333 !important; }
        .pl-item:hover { background:#15151e !important; }
      `}</style>

      {/* ── TOPBAR ── */}
      <div style={{ gridColumn: "1 / -1", background: "#0d0d12", borderBottom: "1px solid #1a1a24", display: "flex", alignItems: "center", padding: "0 18px", gap: 14 }}>
        <span style={{ fontWeight: 900, fontSize: 16, color: "#f59e0b", letterSpacing: "0.05em", marginRight: 8 }}>LUMEN LIVE</span>
        <div style={{ width: 1, height: 20, background: "#2a2a35" }} />
        <button onClick={openOutput} style={S.btn}>Abrir Output</button>
        <button onClick={fullscreen} style={S.btn}>Fullscreen</button>
        <button onClick={exportService} style={S.btn}>Exportar</button>
        <button onClick={() => importRef.current?.click()} style={S.btn}>Importar</button>
        <input ref={importRef} type="file" accept=".json" hidden onChange={(e) => importService(e.target.files?.[0])} />
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: "#444" }}>← → slides · Enter LIVE · Esc limpia letra · X limpia todo · B negro · L logo</span>
      </div>

      {/* ── LEFT: PLAYLIST ── */}
      <aside onDrop={handleDropMediaToPlaylist} onDragOver={allowMediaDrop}
        style={{ background: "#0d0d12", borderRight: "1px solid #1a1a24", overflow: "hidden", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px", borderBottom: "1px solid #1a1a24" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <p style={S.label}>PLAYLIST · {playlist.length} items</p>
            {playlist.length > 0 && (
              <button onClick={() => setPlaylist([])} style={{ ...S.btnDanger, padding: "4px 8px", fontSize: 11 }}>Limpiar</button>
            )}
          </div>
          {deckSong && <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Activa: {deckSong.title}</div>}
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {playlist.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center", color: "#333", fontSize: 13 }}>
              Playlist vacía<br />
              <span style={{ fontSize: 11, marginTop: 6, display: "block", color: "#2a2a35" }}>Agrega canciones o arrastra media</span>
            </div>
          ) : (
            playlist.map((item, index) => {
              const isMedia = isMediaItem(item);
              const song = isMedia ? null : (item as Song);
              const media = isMedia ? (item as MediaAsset) : null;
              const isActive = song ? deckSong?.id === song.id : liveMedia?.id === media?.id;
              return (
                <div key={`${item.id}-${index}`} className="pl-item"
                  onClick={() => loadPlaylistItemToPreview(index)}
                  onDoubleClick={() => sendPlaylistItemToLive(index)}
                  style={{ borderRadius: 10, border: isActive ? `1px solid ${theme.accent}` : "1px solid #1a1a24", background: isActive ? "rgba(245,158,11,.08)" : "#111116", marginBottom: 8, padding: 10, cursor: "pointer" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: isMedia ? "#60a5fa" : "#c084fc" }}>
                      {isMedia ? media?.type.toUpperCase() : "CANCIÓN"}
                    </span>
                    <span style={{ fontSize: 11, color: "#444" }}>#{index + 1}</span>
                  </div>
                  <div style={{ color: isActive ? theme.accent : "#aaa", fontSize: 13, fontWeight: 800, marginTop: 6 }}>
                    {song ? song.title : media?.name}
                  </div>
                  <div style={{ color: "#555", fontSize: 11, marginTop: 4, lineHeight: 1.35 }}>
                    {song ? song.slides[0]?.text : "Fondo media"}
                  </div>
                  <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                    <button onClick={(e) => { e.stopPropagation(); movePlaylistItem(index, -1); }} style={{ ...S.btn, padding: "4px 8px" }}>↑</button>
                    <button onClick={(e) => { e.stopPropagation(); movePlaylistItem(index, 1); }} style={{ ...S.btn, padding: "4px 8px" }}>↓</button>
                    <button onClick={(e) => { e.stopPropagation(); sendPlaylistItemToLive(index); }} style={{ ...S.btnLive, padding: "4px 9px" }}>LIVE</button>
                    <button onClick={(e) => { e.stopPropagation(); removePlaylistItem(index); }} style={{ ...S.btnDanger, padding: "4px 8px", marginLeft: "auto" }}>✕</button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* ── CENTER ── */}
      <main style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Slide grid */}
        <section style={{ maxHeight: "42vh", overflowY: "auto", background: "#0f0f15", borderBottom: "1px solid #1a1a24", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={S.label}>
              {deckSource === "song" && deckSong
                ? `${deckSong.title} · ${deckSlides.length} slides`
                : query ? `Resultados: ${searchResults.length}`
                : `${currentBook?.name || ""} ${chapterIndex + 1} · ${verses.length} vers.`}
            </p>
            {deckSource === "song" && (
              <button onClick={() => { setDeckSource("bible"); setDeckSong(null); setContentTab("bible"); }} style={{ ...S.btn, padding: "3px 8px", fontSize: 11 }}>
                ← Biblia
              </button>
            )}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 8 }}>
            {deckSlides.map((slide, i) => {
              const key = slideKey(slide);
              const assignedMedia = slideMediaMap[key];
              const isLive = liveSlide?.label === slide.label && liveSlide?.text === slide.text;
              const isSel = selectedSlide?.label === slide.label && selectedSlide?.text === slide.text;
              return (
                <div key={`${slide.label}-${i}`} className="slide-card"
                  onDrop={(e) => handleDropMediaToOneSlide(e, slide)} onDragOver={allowMediaDrop}
                  onClick={() => selectSlideForPreview(slide)} onDoubleClick={() => sendDirectToLive(slide)}
                  title="Arrastra media aquí para asignarla a esta estrofa"
                  style={{
                    borderRadius: 10,
                    border: isLive ? "2px solid #ef4444" : isSel ? `2px solid ${theme.accent}` : "1px solid #1e1e28",
                    background: assignedMedia
                      ? assignedMedia.type === "image"
                        ? `linear-gradient(rgba(0,0,0,.58),rgba(0,0,0,.68)), url(${assignedMedia.dataUrl}) center/cover no-repeat`
                        : "linear-gradient(135deg,#111827,#020617)"
                      : isLive ? "rgba(239,68,68,.1)" : isSel ? "rgba(245,158,11,.08)" : "#14141a",
                    padding: 10, cursor: "pointer", minHeight: 88, position: "relative", overflow: "hidden",
                  }}>
                  {isLive && (
                    <span style={{ position: "absolute", top: 6, right: 6, fontSize: 9, background: "#ef4444", color: "#fff", borderRadius: 4, padding: "2px 5px", fontWeight: 800 }}>LIVE</span>
                  )}
                  {assignedMedia && (
                    <span style={{ position: "absolute", top: 6, left: 6, fontSize: 9, background: "#1d4ed8", color: "#fff", borderRadius: 4, padding: "2px 5px", fontWeight: 800 }}>
                      {assignedMedia.type.toUpperCase()}
                    </span>
                  )}
                  <div style={{ fontSize: 10, color: assignedMedia ? "#bfdbfe" : isLive ? "#f87171" : isSel ? theme.accent : "#444", marginBottom: 5, marginTop: assignedMedia ? 18 : 0, fontWeight: 800 }}>
                    {slide.type === "bible" ? `v.${i + 1}` : `Slide ${i + 1}`}
                  </div>
                  <div style={{ fontSize: 12, color: assignedMedia ? "#fff" : isLive ? "#fca5a5" : isSel ? "#fde68a" : "#777", lineHeight: 1.35, whiteSpace: "pre-line" }}>
                    {slide.text}
                  </div>
                  {assignedMedia && (
                    <button onClick={(e) => { e.stopPropagation(); removeMediaFromSlide(slide); }}
                      style={{ position: "absolute", bottom: 6, right: 6, ...S.btnDanger, padding: "2px 6px", fontSize: 10 }}>
                      quitar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Content tabs */}
        <section style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", gap: 4, padding: "10px 14px 0", borderBottom: "1px solid #1a1a24", background: "#0d0d12" }}>
            {(["bible", "songs", "media", "cameras", "themes"] as const).map((t) => (
              <button key={t} onClick={() => setContentTab(t)} style={tabStyle(contentTab === t)}>
                {{ bible: "Biblia", songs: "Canciones", media: "Media", cameras: "Cámaras", themes: "Temas" }[t]}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>

            {/* SONGS */}
            {contentTab === "songs" && (
              <div>
                <p style={S.label}>{editingSongId ? "EDITANDO CANCIÓN" : "NUEVA CANCIÓN"}</p>
                <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Título" style={S.input} />
                <input value={songAuthor} onChange={(e) => setSongAuthor(e.target.value)} placeholder="Autor / categoría" style={S.input} />
                <textarea value={songLyrics} onChange={(e) => setSongLyrics(e.target.value)} placeholder={"Letra de la canción\n\nSepara slides con línea vacía"} style={S.textarea} />
                <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
                  <button onClick={saveSong} style={S.btnAccent}>{editingSongId ? "Guardar cambios" : "Crear canción"}</button>
                  <button onClick={clearSongForm} style={S.btnDanger}>Limpiar</button>
                </div>
                <p style={S.label}>CANCIONES GUARDADAS · {songs.length}</p>
                {songs.map((song) => {
                  const inPlaylist = playlist.some((item) => item.id === song.id);
                  return (
                    <div key={song.id} style={{ border: "1px solid #1e1e28", background: "#111116", borderRadius: 10, padding: 12, marginBottom: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <strong>{song.title}</strong>
                        <span style={{ color: "#555", fontSize: 12 }}>{song.slides.length} slides</span>
                      </div>
                      <div style={{ color: "#555", fontSize: 12, marginTop: 4 }}>{song.author || "Sin autor"}{inPlaylist ? " · En playlist" : ""}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 10 }}>
                        <button onClick={() => loadSongToDeck(song)} style={S.btn}>Ver slides</button>
                        <button onClick={() => startEditSong(song)} style={S.btn}>Editar</button>
                        <button onClick={() => addSongToPlaylist(song)} style={{ ...S.btnGreen, opacity: inPlaylist ? 0.5 : 1 }}>
                          {inPlaylist ? "En Playlist" : "+ Playlist"}
                        </button>
                        <button onClick={() => loadSongToDeck(song, true)} style={S.btnLive}>1er LIVE</button>
                        <button onClick={() => deleteSong(song.id)} style={S.btnDanger}>✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* BIBLE */}
            {contentTab === "bible" && (
              <div>
                <p style={S.label}>VERSIÓN BÍBLICA</p>
                <select value={activeCatalog?.id || ""} onChange={(e) => setActiveCatalog(catalog.find((b) => b.id === e.target.value) || null)} style={{ ...S.select, width: "100%", marginBottom: 12 }}>
                  {catalog.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.abbreviation})</option>)}
                </select>
                <input value={query} onChange={(e) => { setQuery(e.target.value); setDeckSource("bible"); setDeckSong(null); }} placeholder="Buscar: Juan 1:1, mundo, Dios..." style={S.input} />
                {!query && bible && (
                  <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                    <select value={bookIndex} onChange={(e) => { setBookIndex(Number(e.target.value)); setChapterIndex(0); setDeckSource("bible"); }} style={{ ...S.select, flex: 2 }}>
                      {books.map((book, i) => <option key={book.name} value={i}>{book.name}</option>)}
                    </select>
                    <select value={chapterIndex} onChange={(e) => { setChapterIndex(Number(e.target.value)); setDeckSource("bible"); }} style={{ ...S.select, flex: 1 }}>
                      {chapters.map((_, i) => <option key={i} value={i}>Cap. {i + 1}</option>)}
                    </select>
                  </div>
                )}
                {(query ? searchResults : verses.map((t, i) => makeBibleSlide(`${currentBook?.name} ${chapterIndex + 1}:${i + 1}`, t))).map((slide, i) => (
                  <div key={`${slide.label}-${i}`}
                    onClick={() => { selectSlideForPreview(slide); setDeckSource("bible"); setDeckSong(null); }}
                    onDoubleClick={() => sendDirectToLive(slide)}
                    style={{ padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 3, color: "#666" }}>
                    <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 800, marginRight: 8 }}>{slide.label}</span>
                    {slide.text}
                  </div>
                ))}
              </div>
            )}

            {/* MEDIA */}
            {contentTab === "media" && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ ...S.label, margin: 0 }}>MEDIA</p>
                  <button onClick={() => mediaFileRef.current?.click()} style={S.btnAccent}>
                    {mediaTab === "images" ? "Subir imagen" : "Subir video"}
                  </button>
                </div>
                <input ref={mediaFileRef} type="file" accept={mediaTab === "images" ? "image/*" : "video/*"} hidden onChange={(e) => uploadMediaFile(e.target.files?.[0])} />
                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                  <button onClick={() => setMediaTab("images")} style={mediaTabStyle(mediaTab === "images")}>Imágenes · {imageAssets.length}</button>
                  <button onClick={() => setMediaTab("videos")} style={mediaTabStyle(mediaTab === "videos")}>Videos · {videoAssets.length}</button>
                </div>
                <div style={{ marginBottom: 16, color: "#555", fontSize: 12, lineHeight: 1.5 }}>
                  Arrastra una imagen/video sobre una estrofa para dejarlo como fondo fijo.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(150px,1fr))", gap: 12 }}>
                  {(mediaTab === "images" ? imageAssets : videoAssets).map(renderMediaCard)}
                </div>
                {(mediaTab === "images" ? imageAssets : videoAssets).length === 0 && (
                  <div style={{ color: "#333", textAlign: "center", padding: 50 }}>
                    No hay {mediaTab === "images" ? "imágenes" : "videos"} guardados
                  </div>
                )}
              </div>
            )}

            {/* CAMERAS */}
            {contentTab === "cameras" && (
              <CameraPanel />
            )}

            {/* THEMES */}
            {contentTab === "themes" && (
              <div>
                <p style={S.label}>TEMA</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {THEMES.map((t) => (
                    <button key={t.id} onClick={() => setThemeId(t.id)} style={{ ...S.btn, color: themeId === t.id ? t.accent : "#aaa", borderColor: themeId === t.id ? t.accent : "#333" }}>
                      {t.name}
                    </button>
                  ))}
                </div>
                <p style={S.label}>FONDO GENERAL</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {BACKGROUNDS.map((b) => (
                    <button key={b.id} onClick={() => b.id === "image" ? bgFileRef.current?.click() : setBgId(b.id)} style={{ ...S.btn, color: bgId === b.id ? theme.accent : "#aaa", borderColor: bgId === b.id ? theme.accent : "#333" }}>
                      {b.name}
                    </button>
                  ))}
                </div>
                <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={(e) => uploadBackground(e.target.files?.[0])} />
                <label style={{ display: "flex", gap: 8, marginBottom: 10, color: "#aaa", cursor: "pointer" }}>
                  <input type="checkbox" checked={lowerThird} onChange={(e) => setLowerThird(e.target.checked)} /> Lower Third
                </label>
                <label style={{ display: "flex", gap: 8, marginBottom: 10, color: "#aaa", cursor: "pointer" }}>
                  <input type="checkbox" checked={showClock} onChange={(e) => setShowClock(e.target.checked)} /> Reloj en Output
                </label>
                <p style={S.label}>TAMAÑO TEXTO · {fontScale.toFixed(1)}x</p>
                <input type="range" min="0.7" max="1.5" step="0.1" value={fontScale} onChange={(e) => setFontScale(Number(e.target.value))} style={{ width: "100%", marginBottom: 12, accentColor: theme.accent }} />
                <input value={logoText} onChange={(e) => setLogoText(e.target.value)} placeholder="Texto del logo" style={S.input} />
              </div>
            )}

          </div>
        </section>
      </main>

      {/* ── RIGHT: LIVE PANEL ── */}
      <aside style={{ background: "#0a0a0e", borderLeft: "1px solid #1a1a24", overflowY: "auto", padding: 14 }}>

        {/* Preview + Live side by side */}
        <div style={{ display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 10, marginBottom: 10 }}>
          <div>
            <p style={S.label}>● PREVIEW</p>
            <div style={{ aspectRatio: "16/9", borderRadius: 12, overflow: "hidden", border: `2px solid ${selectedSlide || selectedMedia ? theme.accent : "#1e1e28"}` }}>
              <LiveSlide slide={selectedSlide} media={selectedMedia} theme={theme} bg={bgValue} customBg={customBg} small fontScale={fontScale * 0.55} />
            </div>
          </div>
          <div>
            <p style={S.label}>● LIVE {liveMedia ? `· ${liveMedia.type.toUpperCase()}` : liveIndex !== null ? `${liveIndex + 1}/${deckSlides.length}` : ""}</p>
            <div style={{
              aspectRatio: "16/9", borderRadius: 12, overflow: "hidden",
              border: `2px solid ${liveSlide || liveMedia ? "#ef4444" : "#1e1e28"}`,
              boxShadow: liveSlide || liveMedia ? "0 0 35px rgba(239,68,68,.45)" : "none",
            }}>
              {blackout ? (
                <div style={{ width: "100%", height: "100%", background: "#000" }} />
              ) : logo ? (
                <div style={{ width: "100%", height: "100%", background: "#000", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>{logoText}</div>
              ) : (
                <LiveSlide slide={liveSlide} media={liveMedia} theme={theme} bg={bgValue} customBg={customBg} lowerThird={lowerThird} small fontScale={fontScale * 0.55} showClock={showClock} />
              )}
            </div>
          </div>
        </div>

        <button onClick={sendPreviewToLive} disabled={!selectedSlide && !selectedMedia}
          style={{ ...S.btnLive, width: "100%", padding: 10, opacity: selectedSlide || selectedMedia ? 1 : 0.45 }}>
          Enviar PREVIEW a LIVE
        </button>

        {/* Navigation */}
        <div style={{ marginTop: 18 }}>
          <p style={S.label}>NAVEGACIÓN</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
            <button onClick={prevLive} style={{ ...S.btn, padding: 10 }}>← Anterior</button>
            <button onClick={nextLive} style={{ ...S.btn, padding: 10 }}>Siguiente →</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <button onClick={() => { setBlackout((v) => !v); setLogo(false); }}
              style={{ ...S.btn, ...(blackout ? { borderColor: "#f59e0b", color: "#f59e0b" } : {}) }}>Negro</button>
            <button onClick={() => { setLogo((v) => !v); setBlackout(false); }}
              style={{ ...S.btn, ...(logo ? { borderColor: "#f59e0b", color: "#f59e0b" } : {}) }}>Logo</button>
            <button onClick={clearOnlyLyrics} style={S.btnDanger}>Limpiar letra</button>
          </div>
          <button onClick={clearAllLive} style={{ ...S.btnDanger, width: "100%", padding: 9 }}>Limpiar TODO · detener fondo</button>
        </div>

        {/* Assigned media for selected slide */}
        {selectedSlide && (
          <div style={{ marginTop: 18, padding: 12, borderRadius: 12, background: "#101018", border: "1px solid #1e1e28" }}>
            <p style={S.label}>FONDO DE ESTA ESTROFA</p>
            <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5 }}>
              {selectedMedia ? `${selectedMedia.type.toUpperCase()} · ${selectedMedia.name}` : "Sin fondo asignado."}
            </div>
            {selectedMedia && (
              <button onClick={() => removeMediaFromSlide(selectedSlide)} style={{ ...S.btnDanger, marginTop: 8, width: "100%" }}>
                Quitar fondo de esta estrofa
              </button>
            )}
          </div>
        )}

        {/* Output */}
        <div style={{ marginTop: 18 }}>
          <p style={S.label}>OUTPUT</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button onClick={openOutput} style={{ ...S.btnAccent, padding: 10 }}>Abrir Output</button>
            <button onClick={fullscreen} style={S.btn}>Fullscreen</button>
          </div>
        </div>

        {/* Add to playlist */}
        {(selectedMedia || (selectedSlide?.type === "song" && deckSong)) && (
          <button onClick={addSelectedToPlaylist} style={{ ...S.btnGreen, width: "100%", padding: 10, marginTop: 18 }}>
            {selectedMedia ? "+ Fondo a Playlist" : "+ Canción a Playlist"}
          </button>
        )}

        {/* Quick design */}
        <div style={{ marginTop: 18 }}>
          <p style={S.label}>DISEÑO RÁPIDO</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {THEMES.map((t) => (
              <button key={t.id} onClick={() => setThemeId(t.id)} style={{ ...S.btn, color: themeId === t.id ? t.accent : "#666", borderColor: themeId === t.id ? t.accent : "#333", padding: "5px 9px", fontSize: 11 }}>
                {t.name}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {BACKGROUNDS.filter((b) => b.id !== "image").map((b) => (
              <button key={b.id} onClick={() => setBgId(b.id)} style={{ ...S.btn, color: bgId === b.id ? theme.accent : "#666", borderColor: bgId === b.id ? theme.accent : "#333", padding: "5px 9px", fontSize: 11 }}>
                {b.name}
              </button>
            ))}
          </div>
        </div>

      </aside>
    </div>
  );
}
