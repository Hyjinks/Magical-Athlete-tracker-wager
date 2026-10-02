import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import {
  Trophy,
  Users,
  Flag,
  Plus,
  X,
  Play,
  RotateCcw,
  Coins,
  Clock,
  Save,
  ChevronRight,
  Minus,
  Sparkles,
  Dices,
} from "lucide-react";

const PALETTE = [
  "#C1301B", // poster red
  "#F4B93B", // poster yellow
  "#4C9A4C", // poster green
  "#4F8FD1", // poster blue
  "#8F72C4", // poster purple
  "#E8639A", // poster pink
  "#E8823D", // poster orange
  "#3F8F8F", // poster teal
  "#8FA83E", // poster olive
  "#9B6B4A", // poster brown
];

// The 36 official racers from the Magical Athlete rulebook, for quick selection.
// Ability text isn't included here — check your racer card for the exact power.
const RACER_NAMES = [
  "Alchemist", "Baba Yaga", "Banana", "Blimp", "Centaur", "Cheerleader",
  "Coach", "Copycat", "Dicemonger", "Duelist", "Egg", "Flip Flop",
  "Genius", "Gunk", "Hare", "Heckler", "Huge Baby", "Hypnotist",
  "Inchworm", "Lackey", "Leaptoad", "Legs", "Lovable Loser", "Magician",
  "Mastermind", "M.O.U.T.H.", "Party Animal", "Rocket Scientist", "Romantic",
  "Scoocher", "Sisyphus", "Skipper", "Stickler", "Suckerfish", "Third Wheel", "Twin",
];

const uid = () => Math.random().toString(36).slice(2, 10);

// ---------------------------------------------------------------------------
// Dice roller — a faithful JS port of the Backgammon Galaxy `DiceRoller`
// Elixir library (DiceRoller.CryptoRandom). MIT licensed.
//
// It uses the Web Crypto API (crypto.getRandomValues), the browser equivalent
// of Erlang's :crypto.strong_rand_bytes/1, and reproduces the same unbiased
// rejection-sampling: a random byte 0–255 is rejected when >= 252 (since
// 252 = 42*6, keeping the modulo perfectly uniform) and otherwise mapped to
// 1–6 via (byte % 6) + 1. roll(true) re-rolls until the two dice differ, the
// library's "exclude doubles" mode used for Backgammon match starts.
// ---------------------------------------------------------------------------
function rollSingleDie() {
  const buf = new Uint8Array(1);
  // Loop rather than recurse (same logic, no stack growth on the rare reject).
  for (;;) {
    crypto.getRandomValues(buf);
    const randByte = buf[0];
    if (randByte < 252) {
      return (randByte % 6) + 1;
    }
    // randByte >= 252 would bias the distribution — draw again.
  }
}

function rollDice(excludeDoubles = false) {
  if (!excludeDoubles) {
    return [rollSingleDie(), rollSingleDie()];
  }
  for (;;) {
    const a = rollSingleDie();
    const b = rollSingleDie();
    if (a !== b) return [a, b];
  }
}

// Place ("finishes in the top 2") odds, derived from the posted win odds —
// no second roll needed. Compresses the win multiplier toward 1x, since
// placing is always an easier bet to win than winning outright, so it always
// pays out less than the win odds for the same racer.
function placeOddsFor(winOdds) {
  if (!winOdds) return 0;
  return Math.round((1 + (winOdds - 1) * 0.4) * 20) / 20;
}

// Aggregates career stats from every saved race record — win rates, streaks,
// and betting performance across the app's whole lifetime, not just one
// session. Pure function of the records array so it's easy to reason about
// and test in isolation.
function computeCareerStats(records) {
  // historyIndex (and so `records`) is newest-first; reverse for streaks,
  // which need to walk each racer's appearances in the order they happened.
  const chronological = [...records].reverse();

  const racerStats = {}; // name -> { entered, wins }
  const bettorNet = {}; // bettor name -> cumulative net across all history
  let biggestPayout = null; // { name, payout, date }
  const streakCounters = {}; // racer name -> current running streak
  let longestStreak = null; // { name, length }

  chronological.forEach((r) => {
    (r.racers || []).forEach((racer) => {
      const name = racer.name;
      if (!racerStats[name]) racerStats[name] = { entered: 0, wins: 0 };
      racerStats[name].entered += 1;
      const won = r.winner === name;
      if (won) racerStats[name].wins += 1;
      streakCounters[name] = won ? (streakCounters[name] || 0) + 1 : 0;
      if (won && (!longestStreak || streakCounters[name] > longestStreak.length)) {
        longestStreak = { name, length: streakCounters[name] };
      }
    });
    (r.results || []).forEach((res) => {
      bettorNet[res.name] = (bettorNet[res.name] || 0) + (res.net || 0);
      if (res.payout > 0 && (!biggestPayout || res.payout > biggestPayout.payout)) {
        biggestPayout = { name: res.name, payout: res.payout, date: r.date };
      }
    });
  });

  const racerList = Object.entries(racerStats)
    .map(([name, s]) => ({
      name,
      entered: s.entered,
      wins: s.wins,
      winRate: s.entered > 0 ? s.wins / s.entered : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.wins - a.wins);

  const bettorList = Object.entries(bettorNet)
    .map(([name, net]) => ({ name, net: Math.round(net * 100) / 100 }))
    .sort((a, b) => b.net - a.net);

  return { totalRaces: records.length, racerList, bettorList, biggestPayout, longestStreak };
}

// Two chrome themes. Racer colors and the "Magical Athlete" wordmark stay
// fixed across both — only backgrounds, cards, and UI accents change.
const THEMES = {
  poster: {
    label: "Poster",
    bg: "#E5402A",
    paper: "#FFFDF8",
    paper2: "#FFFCF5",
    ink: "#1A1408",
    red: "#C1301B",
    yellow: "#F4B93B",
    green: "#4C9A4C",
    purple: "#8F72C4",
    muted: "#6b6b6b",
    mutedGreen: "#3F7D3F",
    highlight: "#F5E3B3",
    onBg: "#FDE7C8",
    onBgMuted: "#FCEBC9",
  },
  calm: {
    label: "Calm",
    bg: "#1B2A22",
    paper: "#F2E8D5",
    paper2: "#F7EFDD",
    ink: "#3E5445",
    red: "#8C2F39",
    yellow: "#C9A227",
    green: "#3E7C59",
    purple: "#7B4B94",
    muted: "#6b6b6b",
    mutedGreen: "#3E7C59",
    highlight: "#E4D8B4",
    onBg: "#E8DCC0",
    onBgMuted: "#B9CDBF",
  },
};

const themeVars = (t) => ({
  "--bg": t.bg,
  "--paper": t.paper,
  "--paper2": t.paper2,
  "--ink": t.ink,
  "--red": t.red,
  "--yellow": t.yellow,
  "--green": t.green,
  "--purple": t.purple,
  "--muted": t.muted,
  "--mutedGreen": t.mutedGreen,
  "--highlight": t.highlight,
  "--onBg": t.onBg,
  "--onBgMuted": t.onBgMuted,
});

const emptyRacer = (i) => ({
  id: uid(),
  name: "",
  player: "",
  notes: "",
  color: PALETTE[i % PALETTE.length],
  position: 0,
  finished: false,
  place: null,
});

// ---- small browser helpers (all fail soft: a missing API never breaks a tap) ----

function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  } catch (e) {
    return false;
  }
}

// Tiny haptic tick on phones that support it (Android Chrome; iOS Safari ignores it).
function buzz(ms = 12) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    // no haptics — fine
  }
}

// Clipboard write with a fallback for sandboxed frames / non-secure contexts
// where navigator.clipboard is unavailable or blocked.
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

// A join link is this page's own address plus ?join=<pin>. Only offered when the
// page is served over http(s) — a file:// or blob: address can't be shared.
function canBuildJoinLink() {
  try {
    return /^https?:$/.test(window.location.protocol);
  } catch (e) {
    return false;
  }
}
function buildJoinLink(pin) {
  const base = window.location.href.split("#")[0].split("?")[0];
  return `${base}?join=${pin}`;
}
// Reads ?join=1234 (or #join=1234) so a shared link lands straight on the
// spectator screen with the code already filled in.
function readJoinParam() {
  try {
    const m = (window.location.search + window.location.hash).match(/[?#&]join=(\d{4})(?!\d)/);
    return m ? m[1] : "";
  } catch (e) {
    return "";
  }
}

// Click/touch ripple: returns [elements, onPointerDown]. Render `elements`
// inside an overflow-hidden, position:absolute layer; each ripple removes
// itself after its animation. Skipped under reduced motion.
function useRipples() {
  const [ripples, setRipples] = useState([]);
  const onPointerDown = (e) => {
    if (prefersReducedMotion()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const id = Math.random().toString(36).slice(2);
    const size = Math.max(r.width, r.height) * 1.6;
    setRipples((list) => [...list, { id, x: e.clientX - r.left, y: e.clientY - r.top, size }]);
    setTimeout(() => setRipples((list) => list.filter((x) => x.id !== id)), 600);
  };
  const elements = ripples.map((rp) => (
    <span key={rp.id} className="lp-ripple" style={{ left: rp.x, top: rp.y, width: rp.size, height: rp.size }} />
  ));
  return [elements, onPointerDown];
}

// Mouse-only 3D tilt toward the cursor, written to CSS variables the card's
// transform already reads. Touch/pen input and reduced motion are ignored.
// Immediate press state for touch: browsers delay :active slightly (to avoid
// firing while a finger starts a scroll), so pointer events set data-pressed
// instead, which the CSS treats exactly like :active.
const pressHandlers = {
  onPointerDown: (e) => {
    e.currentTarget.dataset.pressed = "1";
  },
  onPointerUp: (e) => {
    delete e.currentTarget.dataset.pressed;
  },
  onPointerCancel: (e) => {
    delete e.currentTarget.dataset.pressed;
  },
};

const tiltHandlers = {
  onPointerMove: (e) => {
    if (e.pointerType !== "mouse" || prefersReducedMotion()) return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--ty", `${(px * 7).toFixed(2)}deg`);
    el.style.setProperty("--tx", `${(-py * 7).toFixed(2)}deg`);
  },
  onPointerLeave: (e) => {
    e.currentTarget.style.setProperty("--tx", "0deg");
    e.currentTarget.style.setProperty("--ty", "0deg");
    delete e.currentTarget.dataset.pressed; // dragged off the card while pressed
  },
};

// A boolean UI preference remembered on this device (personal storage).
function usePersistentFlag(key, initial) {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const r = await window.storage.get(key, false);
        if (!off && r) setValue(JSON.parse(r.value));
      } catch (e) {
        // keep the default
      }
    })();
    return () => {
      off = true;
    };
  }, [key]);
  const set = (v) => {
    setValue(v);
    window.storage.set(key, JSON.stringify(v), false).catch(() => {});
  };
  return [value, set];
}

// "idle" | "copied" | "failed", reverting to idle after ~2s.
function useCopy() {
  const [state, setState] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (text) => {
    const ok = await copyText(text);
    buzz(10);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  };
  return [state, copy];
}

// The host's share block: the big code is itself tap-to-copy, with explicit
// "Copy code" and "Copy join link" buttons under it. The link button only
// appears when the page has a shareable http(s) address.
function JoinShare({ pin }) {
  const [pinState, copyPin] = useCopy();
  const hasLink = canBuildJoinLink();
  const link = hasLink ? buildJoinLink(pin) : "";
  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => copyPin(pin)}
        aria-label={`Join code ${pin.split("").join(" ")}. Tap to copy.`}
        className="lp-press w-full text-center rounded-xl py-1 mb-2"
        style={{ background: "transparent" }}
      >
        <span
          className="block font-mono font-bold text-4xl"
          style={{ color: "var(--red)", letterSpacing: "0.3em", paddingLeft: "0.3em" }}
        >
          {pin}
        </span>
        <span className="block font-mono text-xs" style={{ color: pinState === "copied" ? "var(--mutedGreen)" : "var(--muted)" }}>
          {pinState === "copied" ? "✓ Code copied" : pinState === "failed" ? "Couldn't copy — read it out instead" : "tap to copy"}
        </span>
      </button>
      <div className={`grid gap-2 ${hasLink ? "grid-cols-2" : "grid-cols-1"}`}>
        <CopyButton text={pin} label="Copy code" icon="🔢" />
        {hasLink && <CopyButton text={link} label="Copy join link" icon="🔗" />}
      </div>
      {hasLink && (
        <p className="font-mono text-xs mt-2 break-all select-all" style={{ color: "var(--muted)" }}>
          {link}
        </p>
      )}
    </div>
  );
}

function CopyButton({ text, label, icon }) {
  const [state, copy] = useCopy();
  return (
    <button
      type="button"
      onClick={() => copy(text)}
      aria-live="polite"
      className="lp-press w-full flex items-center justify-center gap-1.5 rounded-lg text-sm font-bold px-2"
      style={{
        background: state === "copied" ? "var(--green)" : "var(--paper)",
        color: state === "copied" ? "var(--paper2)" : "var(--ink)",
        border: "2.5px solid var(--ink)",
        boxShadow: "3px 3px 0px var(--ink)",
        transition: "background 0.15s, color 0.15s",
      }}
    >
      {state === "copied" ? "✓ Copied!" : state === "failed" ? "Couldn't copy" : <>{icon} {label}</>}
    </button>
  );
}

function useStorage() {
  const [ready, setReady] = useState(false);
  const [roster, setRoster] = useState(null);
  const [bettorRoster, setBettorRoster] = useState(null);
  const [historyIndex, setHistoryIndex] = useState([]);
  const [savedSession, setSavedSession] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await window.storage.get("app-session", false);
        setSavedSession(s ? JSON.parse(s.value) : null);
      } catch (e) {
        setSavedSession(null);
      }
      try {
        const r = await window.storage.get("roster", false);
        setRoster(r ? JSON.parse(r.value) : null);
      } catch (e) {
        setRoster(null);
      }
      try {
        const b = await window.storage.get("bettor-roster", false);
        setBettorRoster(b ? JSON.parse(b.value) : null);
      } catch (e) {
        setBettorRoster(null);
      }
      try {
        const h = await window.storage.get("history-index", false);
        setHistoryIndex(h ? JSON.parse(h.value) : []);
      } catch (e) {
        setHistoryIndex([]);
      }
      setReady(true);
    })();
  }, []);

  return { ready, roster, setRoster, bettorRoster, historyIndex, setHistoryIndex, savedSession };
}

export default function App() {
  const { ready, roster, bettorRoster, historyIndex, setHistoryIndex, savedSession } = useStorage();
  const { seen: onboardingSeen, dismiss: dismissOnboarding, loaded: onboardingLoaded } = useOnboarding();
  const [showHelp, setShowHelp] = useState(false);

  // null (chooser) | "host" | "spectator". A shared ?join=1234 link starts in
  // spectator mode; a saved host session still takes over once it hydrates.
  const [mode, setMode] = useState(() => (readJoinParam() ? "spectator" : null));
  const [joinPin, setJoinPin] = useState(readJoinParam); // code from the landing field or a shared link
  const [leaving, setLeaving] = useState(false); // landing cards easing out before a role screen
  const leaveTimer = useRef(null);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  // A saved host game, if any, summarised for the landing screen's
  // "Continue your game" ticket.
  const resumeInfo =
    savedSession && savedSession.mode === "host"
      ? {
          race: savedSession.gameSession
            ? `Race ${Math.min(savedSession.gameSession.raceNumber, savedSession.gameSession.totalRaces)} of ${savedSession.gameSession.totalRaces}`
            : null,
          status: savedSession.showChampion
            ? "Game complete"
            : savedSession.status === "racing"
            ? "Race in progress"
            : savedSession.status === "finished"
            ? "Race finished"
            : "Setting up",
        }
      : null;

  // Soft hand-off: the landing cards ease up and fade, then the role screen
  // swaps in and its sections rise in one by one (ArriveOnce). No full-screen
  // cover, so nothing flashes. Reduced motion: swap immediately.
  const transitionTo = (swap) => {
    if (prefersReducedMotion()) {
      swap();
      return;
    }
    setLeaving(true);
    clearTimeout(leaveTimer.current);
    leaveTimer.current = setTimeout(() => {
      swap();
      setLeaving(false);
      window.scrollTo(0, 0);
    }, 300);
  };
  const [showDraft, setShowDraft] = useState(false);
  // After a draft: each player's remaining un-raced racers, keyed by player label.
  const [draftedTeams, setDraftedTeams] = useState(null);
  // Player labels who drafted a team — used to enforce "each racer can only
  // be used once," even after a player's bench is empty.
  const [draftPlayers, setDraftPlayers] = useState([]);
  // Racers each drafted player has already raced, as { [player]: [{ name, race }] }.
  // Drives the "Who's holding what" card; the roster itself forgets a racer
  // the moment its race ends, so this is the only record of spent racers.
  const [usedRacers, setUsedRacers] = useState({});
  // Which draft variant is active — determines the between-races turn-order
  // rule: standard/3-player-double use board position, 2-player uses points.
  const [draftVariantId, setDraftVariantId] = useState(null);
  // A 4-race game, started only by a standard-variant draft (the 2-player and
  // 3-player-double variants use a different racers-per-race structure that
  // isn't confirmed race-by-race, so they don't get session tracking).
  const [gameSession, setGameSession] = useState(null); // { id, raceNumber, totalRaces } | null
  const [showChampion, setShowChampion] = useState(false);
  // Suggested next turn order: worst board position from the last race goes
  // first. Captured at race-end, since positions get wiped on reset.
  const [lastRaceOrder, setLastRaceOrder] = useState(null);
  // 2-player variant only: each player's points earned in the last race,
  // ascending (lower goes first per the rulebook). Ties need a roll-off.
  const [lastRacePoints, setLastRacePoints] = useState(null);
  // Whose turn it is during a live race. Seeded from the previous race's
  // turn-order winner (already computed elsewhere); manually correctable by
  // tapping any racer, since the app can't know real table seating.
  const [activeRacerId, setActiveRacerId] = useState(null);
  // Whether the active racer has had at least one move applied since their
  // turn began — drives the "Next turn" button's emphasis, so it's obvious
  // once you've moved that tapping it is what makes the game proceed.
  const [turnHasMoved, setTurnHasMoved] = useState(false);

  // Manual override (tapping a racer row) — sets who's active AND treats it
  // as a fresh turn, same as advanceTurn.
  const setActiveTurn = (id) => {
    setActiveRacerId(id);
    setTurnHasMoved(false);
  };

  const [tab, setTab] = useState("setup");
  const [themeId, setThemeId] = useState("poster");
  const theme = THEMES[themeId] || THEMES.poster;

  // --- spectator-betting session (host side) ---
  const [specEnabled, setSpecEnabled] = useState(false);
  const [sessionPin, setSessionPin] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [raceId, setRaceId] = useState(() => uid());
  const knownBetKeysRef = useRef(new Set());

  // Deletes every shared key under a prefix — best effort, fire-and-forget.
  // Used to sweep spectator bet records and stale snapshots that would
  // otherwise sit in shared storage forever with nothing left to read them.
  const clearSharedUnder = useCallback(async (prefix) => {
    try {
      const listRes = await window.storage.list(prefix, true);
      const keys = (listRes && listRes.keys) || [];
      await Promise.all(keys.map((k) => window.storage.delete(k, true).catch(() => {})));
    } catch (e) {
      // best effort
    }
  }, []);

  const enableSpectatorBetting = async () => {
    // Starting a fresh session — sweep the previous token's leftovers (its
    // snapshot and any bets under it) rather than abandoning them.
    if (sessionToken) {
      clearSharedUnder(`bet:${sessionToken}:`);
      window.storage.delete(`race:${sessionToken}`, true).catch(() => {});
    }
    const token = uid();
    const pin = String(Math.floor(1000 + Math.random() * 9000));
    setSessionToken(token);
    setSessionPin(pin);
    setSpecEnabled(true);
    try {
      await window.storage.set("session-pin", JSON.stringify({ pin, token, active: true }), true);
    } catch (e) {
      // best effort
    }
  };

  const disableSpectatorBetting = async () => {
    setSpecEnabled(false);
    if (sessionToken) {
      // Nothing will poll this token again — clear its bets and snapshot.
      clearSharedUnder(`bet:${sessionToken}:`);
      window.storage.delete(`race:${sessionToken}`, true).catch(() => {});
    }
    try {
      if (sessionToken) {
        await window.storage.set(
          "session-pin",
          JSON.stringify({ pin: sessionPin, token: sessionToken, active: false }),
          true
        );
      }
    } catch (e) {
      // best effort
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get("theme-preference", false);
        if (saved && THEMES[saved.value]) setThemeId(saved.value);
      } catch (e) {
        // best effort — default theme stands
      }
    })();
  }, []);

  const changeTheme = async (id) => {
    setThemeId(id);
    try {
      await window.storage.set("theme-preference", id, false);
    } catch (e) {
      // best effort
    }
  };

  // House rules: table-level toggles for groups that don't play every part
  // of the official ruleset. Persisted like the theme, one device's choice.
  const [houseRules, setHouseRules] = useState({ bettingEnabled: true, bronzeEnabled: true });
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const saved = await window.storage.get("house-rules", false);
        if (saved) {
          const parsed = JSON.parse(saved.value);
          setHouseRules((prev) => ({ ...prev, ...parsed }));
        }
      } catch (e) {
        // best effort — defaults stand
      }
    })();
  }, []);

  const updateHouseRule = async (key, value) => {
    setHouseRules((prev) => {
      const next = { ...prev, [key]: value };
      window.storage.set("house-rules", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  };

  const [status, setStatus] = useState("setup"); // setup | racing | finished
  const [trackLength, setTrackLength] = useState(20);
  const [trackName, setTrackName] = useState("mild"); // "mild" | "wild" | "custom"
  const [racers, setRacers] = useState([emptyRacer(0), emptyRacer(1)]);

  // Two racers should never share a colour while the roster is being set up
  // (drafts, race-2 loads and older saves can produce duplicates). Recolour the
  // later one with the first unused palette colour.
  useEffect(() => {
    if (status !== "setup") return;
    const seen = new Set();
    let changed = false;
    const next = racers.map((r) => {
      if (!seen.has(r.color)) {
        seen.add(r.color);
        return r;
      }
      const free = PALETTE.find((c) => !seen.has(c) && !racers.some((o) => o.color === c));
      if (!free) return r;
      seen.add(free);
      changed = true;
      return { ...r, color: free };
    });
    if (changed) setRacers(next);
  }, [racers, status]);
  const [bettors, setBettors] = useState([]);
  const [bets, setBets] = useState([]); // {id, bettorName, racerId, amount}
  const [finishOrder, setFinishOrder] = useState([]); // racer ids in finish order
  const [turnLog, setTurnLog] = useState([]);
  const [moveHistory, setMoveHistory] = useState([]); // undo stack for moves in the current race
  const [savedThisRace, setSavedThisRace] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [goldPoints, setGoldPoints] = useState("");
  const [silverPoints, setSilverPoints] = useState("");
  // Bronze chips (star spaces on the Wild Wilds track): bonus points earned
  // mid-race, per player label. Entered at race end alongside gold/silver.
  const [bronzePoints, setBronzePoints] = useState({});
  // Running spectator bankrolls: each bettor's cumulative net across races,
  // applied once per race when the result is saved.
  const [bankrolls, setBankrolls] = useState({});
  const [odds, setOdds] = useState({}); // racerId -> fixed decimal odds, set by the "bookie"

  // bet form
  const [betBettor, setBetBettor] = useState("");
  const [betRacer, setBetRacer] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [betType, setBetType] = useState("win"); // "win" | "place"
  const [newBettorName, setNewBettorName] = useState("");

  // Whether we've finished the initial load/restore. The write-back effect
  // stays silent until then, so a fresh page can never clobber a saved
  // session with initial empty state.
  const hydratedRef = useRef(false);

  // Restore a saved in-progress session (refresh recovery). Takes precedence
  // over the plain roster auto-load below — the snapshot knows about retired
  // drafted racers, the race counter, benches, scores, and bankrolls, while
  // the roster key alone could resurrect already-used racers.
  useEffect(() => {
    if (!ready) return;
    const s = savedSession;
    if (s && s.mode === "host") {
      try {
        if (Array.isArray(s.racers) && s.racers.length) setRacers(s.racers);
        if (Array.isArray(s.bettors)) setBettors(s.bettors);
        if (Array.isArray(s.bets)) setBets(s.bets);
        if (Array.isArray(s.finishOrder)) setFinishOrder(s.finishOrder);
        if (Array.isArray(s.turnLog)) setTurnLog(s.turnLog);
        if (Array.isArray(s.moveHistory)) setMoveHistory(s.moveHistory);
        if (s.odds && typeof s.odds === "object") setOdds(s.odds);
        if (typeof s.status === "string") setStatus(s.status);
        // Standard track (20 spaces) unless Custom was explicitly chosen.
        if (s.trackName === "custom" && typeof s.trackLength === "number") {
          setTrackName("custom");
          setTrackLength(s.trackLength);
        } else {
          setTrackName(s.trackName === "wild" ? "wild" : "mild");
          setTrackLength(20);
        }
        if (typeof s.savedThisRace === "boolean") setSavedThisRace(s.savedThisRace);
        if (typeof s.goldPoints === "string") setGoldPoints(s.goldPoints);
        if (typeof s.silverPoints === "string") setSilverPoints(s.silverPoints);
        if (s.bronzePoints && typeof s.bronzePoints === "object") setBronzePoints(s.bronzePoints);
        if (s.bankrolls && typeof s.bankrolls === "object") setBankrolls(s.bankrolls);
        if (s.gameSession) setGameSession(s.gameSession);
        if (typeof s.showChampion === "boolean") setShowChampion(s.showChampion);
        if (Array.isArray(s.draftedTeams)) setDraftedTeams(s.draftedTeams);
        else if (s.draftedTeams === null) setDraftedTeams(null);
        if (Array.isArray(s.draftPlayers)) setDraftPlayers(s.draftPlayers);
        if (s.usedRacers && typeof s.usedRacers === "object") setUsedRacers(s.usedRacers);
        if (s.draftVariantId != null) setDraftVariantId(s.draftVariantId);
        if (Array.isArray(s.lastRaceOrder)) setLastRaceOrder(s.lastRaceOrder);
        if (Array.isArray(s.lastRacePoints)) setLastRacePoints(s.lastRacePoints);
        if (typeof s.raceId === "string") setRaceId(s.raceId);
        if (typeof s.activeRacerId === "string" || s.activeRacerId === null) {
          setActiveRacerId(s.activeRacerId);
        }
        if (typeof s.turnHasMoved === "boolean") setTurnHasMoved(s.turnHasMoved);
        if (typeof s.specEnabled === "boolean") setSpecEnabled(s.specEnabled);
        if (typeof s.sessionToken === "string" || s.sessionToken === null) {
          setSessionToken(s.sessionToken);
        }
        if (typeof s.sessionPin === "string" || s.sessionPin === null) {
          setSessionPin(s.sessionPin);
        }
        // Deliberately NOT switching to host mode here. The saved game is loaded
        // into state, but the landing screen waits for a tap and offers
        // "Continue your game" — jumping straight in made the first screen
        // flash and vanish without the player choosing anything.
      } catch (e) {
        // corrupt snapshot — fall through to fresh state
      }
    }
    hydratedRef.current = true;
  }, [ready]); // eslint-disable-line

  // Write the session snapshot whenever game-critical state changes (host
  // mode only). Skips redundant writes via a serialized-string comparison,
  // and debounces the actual network call so rapid changes (typing into the
  // points fields, a burst of moves) coalesce into one write instead of
  // hammering the storage API on every keystroke — which can eat into its
  // rate limit and cause *other* concurrent writes (like Save result) to
  // fail silently.
  const lastSnapshotRef = useRef("");
  const sessionWriteTimerRef = useRef(null);
  useEffect(() => {
    if (!hydratedRef.current || mode !== "host") return;
    const snapshot = {
      mode: "host",
      status,
      trackLength,
      trackName,
      racers,
      bettors,
      bets,
      finishOrder,
      turnLog,
      moveHistory,
      odds,
      savedThisRace,
      goldPoints,
      silverPoints,
      bronzePoints,
      bankrolls,
      gameSession,
      showChampion,
      draftedTeams,
      draftPlayers,
      usedRacers,
      draftVariantId,
      lastRaceOrder,
      lastRacePoints,
      raceId,
      activeRacerId,
      turnHasMoved,
      specEnabled,
      sessionToken,
      sessionPin,
    };
    const serialized = JSON.stringify(snapshot);
    if (serialized === lastSnapshotRef.current) return;
    lastSnapshotRef.current = serialized;
    clearTimeout(sessionWriteTimerRef.current);
    sessionWriteTimerRef.current = setTimeout(() => {
      window.storage.set("app-session", serialized, false).catch(() => {});
    }, 700);
  });

  // load saved roster once on ready — only when no session snapshot is
  // being restored (the snapshot's racers are authoritative).
  useEffect(() => {
    if (savedSession && savedSession.mode === "host") return;
    if (ready && roster && roster.length >= 2) {
      setRacers(
        roster.map((r, i) => ({
          id: uid(),
          name: r.name,
          player: r.player || "",
          notes: r.notes || "",
          color: r.color || PALETTE[i % PALETTE.length],
          position: 0,
          finished: false,
          place: null,
        }))
      );
    }
  }, [ready]); // eslint-disable-line

  // load saved spectators once on ready — snapshot takes precedence
  useEffect(() => {
    if (savedSession && savedSession.mode === "host") return;
    if (ready && bettorRoster && bettorRoster.length > 0) {
      setBettors(bettorRoster.map((name) => ({ id: uid(), name })));
    }
  }, [ready]); // eslint-disable-line

  const persistBettors = useCallback(async (list) => {
    try {
      const payload = list.map((b) => b.name).filter((n) => n.trim());
      await window.storage.set("bettor-roster", JSON.stringify(payload), false);
    } catch (e) {
      // best effort
    }
  }, []);

  const persistRoster = useCallback(
    async (list) => {
      try {
        const payload = list
          .filter((r) => r.name.trim())
          .map((r) => ({ name: r.name, player: r.player, notes: r.notes, color: r.color }));
        await window.storage.set("roster", JSON.stringify(payload), false);
      } catch (e) {
        // best effort
      }
    },
    []
  );

  const addRacer = () => {
    const fresh = emptyRacer(racers.length);
    const free = PALETTE.find((c) => !racers.some((r) => r.color === c));
    if (free) fresh.color = free;
    setRacers([...racers, fresh]);
  };

  // Receives the finished draft: teams = [{ player, racers: [name, ...] }].
  // Each player fields their first drafted racer now; the rest are held for
  // the game's later races (fielded one-per-race via "next race" prompts).
  const applyDraft = (teams, variantId, raceCount) => {
    const fielded = teams
      .filter((t) => t.racers.length > 0)
      .map((t, i) => ({
        id: uid(),
        name: t.racers[0],
        player: t.player,
        notes: "",
        color: PALETTE[i % PALETTE.length],
        position: 0,
        finished: false,
        place: null,
      }));
    if (fielded.length >= 2) {
      setRacers(fielded);
      persistRoster(fielded);
    }
    const remaining = teams
      .map((t) => ({ player: t.player, racers: t.racers.slice(1) }))
      .filter((t) => t.racers.length > 0);
    setDraftedTeams(remaining.length ? remaining : null);
    setDraftPlayers(teams.map((t) => t.player));
    setUsedRacers({});
    setDraftVariantId(variantId);
    setGameSession(
      variantId === "standard" ? { id: uid(), raceNumber: 1, totalRaces: raceCount || 4 } : null
    );
    setShowChampion(false);
    setLastRaceOrder(null);
    setLastRacePoints(null);
    setShowDraft(false);
    setTab("setup");
  };

  const updateRacer = (id, patch) => {
    const next = racers.map((r) => (r.id === id ? { ...r, ...patch } : r));
    setRacers(next);
    persistRoster(next);
  };

  const removeRacer = (id) => {
    const next = racers.filter((r) => r.id !== id);
    setRacers(next);
    persistRoster(next);
    setBets(bets.filter((b) => b.racerId !== id));
    setOdds((prev) => {
      if (!(id in prev)) return prev;
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    if (betRacer === id) setBetRacer("");
  };

  const addBettor = () => {
    const name = newBettorName.trim();
    if (!name) return;
    const next = [...bettors, { id: uid(), name }];
    setBettors(next);
    persistBettors(next);
    setNewBettorName("");
  };

  const removeBettor = (id) => {
    const removed = bettors.find((b) => b.id === id);
    const next = bettors.filter((b) => b.id !== id);
    setBettors(next);
    persistBettors(next);
    if (removed) {
      // Drop their bets (and shared copies) so they don't linger in the pool.
      const theirBets = bets.filter((b) => b.bettorName === removed.name);
      setBets(bets.filter((b) => b.bettorName !== removed.name));
      if (specEnabled && sessionToken) {
        theirBets.forEach((b) => {
          window.storage.delete(`bet:${sessionToken}:${raceId}:${b.id}`, true).catch(() => {});
        });
      }
      if (betBettor === removed.name) setBetBettor("");
    }
  };

  const placeBet = () => {
    const amt = parseFloat(betAmount);
    if (!betBettor || !betRacer || !amt || amt <= 0 || !odds[betRacer]) return;
    const bet = { id: uid(), bettorName: betBettor, racerId: betRacer, amount: amt, betType };
    setBets([...bets, bet]);
    setBetAmount("");
    if (specEnabled && sessionToken) {
      window.storage
        .set(`bet:${sessionToken}:${raceId}:${bet.id}`, JSON.stringify(bet), true)
        .catch(() => {});
    }
  };

  const removeBet = (id) => {
    setBets(bets.filter((b) => b.id !== id));
    if (specEnabled && sessionToken) {
      window.storage.delete(`bet:${sessionToken}:${raceId}:${id}`, true).catch(() => {});
    }
  };

  const validRacers = racers.filter((r) => r.name.trim());

  // Odds lock once money is down — or while spectators can bet from their own
  // devices, since one of their bets may be in flight between polls.
  const oddsLocked = bets.length > 0 || (specEnabled && Object.keys(odds).length > 0);

  const rollOdds = () => {
    if (oddsLocked) return;
    const map = {};
    validRacers.forEach((r) => {
      // Skewed random spread (1.5x–9x) so every racer gets a plausible but
      // unpredictable line — a new "bookie" every race.
      map[r.id] = Math.round((1.5 + Math.random() * Math.random() * 7.5) * 20) / 20;
    });
    setOdds(map);
  };


  const startRace = () => {
    if (validRacers.length < 2) return;
    setRacers(racers.map((r) => ({ ...r, position: 0, finished: false, place: null })));
    setFinishOrder([]);
    setTurnLog([]);
    setMoveHistory([]);
    setStatus("racing");
    setTab("track");
    setSavedThisRace(false);
    setSaveError(null);
    setGoldPoints("");
    setSilverPoints("");
    setBronzePoints({});

    // Seed whose turn it is. Prefer the already-computed turn-order winner
    // from the race that just ended (points-based for 2-player, position-
    // based otherwise); fall back to the first racer for race 1, where
    // there's no prior race to base it on.
    let starter = validRacers[0]?.id ?? null;
    if (lastRacePoints && lastRacePoints.length > 0) {
      const match = validRacers.find((r) => r.player === lastRacePoints[0].player);
      if (match) starter = match.id;
    } else if (lastRaceOrder && lastRaceOrder.length > 0) {
      const match = validRacers.find((r) => r.name === lastRaceOrder[0].name);
      if (match) starter = match.id;
    }
    setActiveRacerId(starter);
    setTurnHasMoved(false);
  };

  // Advances to the next eligible (unfinished) racer, cycling through in
  // roster order. Used both by the explicit "Next turn" action and
  // automatically when the active racer's own move finishes the race.
  const advanceTurn = () => {
    setTurnHasMoved(false);
    const eligible = validRacers.filter((r) => !r.finished);
    if (eligible.length === 0) {
      setActiveRacerId(null);
      return;
    }
    const currentIdx = eligible.findIndex((r) => r.id === activeRacerId);
    const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % eligible.length;
    setActiveRacerId(eligible[nextIdx].id);
  };

  const moveRacer = (id, delta) => {
    if (status !== "racing") return;
    const racer = racers.find((r) => r.id === id);
    if (!racer || racer.finished) return; // no-op: nothing to move, log, or undo

    setTurnHasMoved(true);
    const prevPosition = racer.position;
    const prevFinishOrder = finishOrder;
    const newPos = Math.max(0, Math.min(trackLength, prevPosition + delta));
    const willFinish = newPos >= trackLength;
    const newFinishOrder =
      willFinish && !prevFinishOrder.includes(id) ? [...prevFinishOrder, id] : prevFinishOrder;
    // A race ends the instant the 2nd racer crosses the line — the rest
    // never finish and don't score.
    const racesJustEnded = willFinish && newFinishOrder.length >= 2 && newFinishOrder !== prevFinishOrder;

    setRacers((prev) =>
      prev.map((r) => (r.id === id ? { ...r, position: newPos, finished: willFinish } : r))
    );
    if (willFinish) {
      setFinishOrder(newFinishOrder);
      if (racesJustEnded) {
        setTimeout(() => setStatus("finished"), 0);
      }
    }

    // The active racer just finished and can't take another turn — hand the
    // turn to whoever's next, rather than leaving a finished racer marked
    // active. Skipped if the race just ended outright (nothing to hand off to).
    // Safe to call with the pre-update racers snapshot: advanceTurn only
    // needs `id`'s position among the not-yet-finished racers to find its
    // successor, which is unaffected by whether `id` itself is flagged yet.
    if (willFinish && id === activeRacerId && !racesJustEnded) {
      advanceTurn();
    }

    const logId = uid();
    setTurnLog((log) => [
      { id: logId, racerName: racer.name, color: racer.color, delta, time: Date.now() },
      ...log,
    ]);
    setMoveHistory((h) => [
      { logId, racerId: id, racerName: racer.name, delta, prevPosition, prevFinishOrder, racesJustEnded },
      ...h,
    ]);
  };

  const undoLastMove = () => {
    if (moveHistory.length === 0) return;
    const last = moveHistory[0];
    setRacers((prev) =>
      prev.map((r) => (r.id === last.racerId ? { ...r, position: last.prevPosition, finished: false } : r))
    );
    setFinishOrder(last.prevFinishOrder);
    if (last.racesJustEnded) {
      setStatus("racing");
      setSavedThisRace(false);
      setSaveError(null);
      // The undone move both finished and handed off this racer — restore
      // them as active, with a clean (not-yet-moved) turn.
      setActiveRacerId(last.racerId);
      setTurnHasMoved(false);
    } else if (last.racerId === activeRacerId) {
      // Undoing the active racer's own most recent move — their turn goes
      // back to not-yet-moved. If they'd made an earlier move too this same
      // turn, this under-counts rather than over-claims, which is the safer
      // direction for what's just a convenience indicator.
      setTurnHasMoved(false);
    }
    setTurnLog((log) => log.filter((t) => t.id !== last.logId));
    setMoveHistory((h) => h.slice(1));
  };

  const setPositionDirect = (id, val) => {
    if (Number.isNaN(val)) return;
    const pos = Math.max(0, Math.min(trackLength, val));
    const racer = racers.find((r) => r.id === id);
    if (!racer) return;
    moveRacer(id, pos - racer.position);
  };

  const endRaceNow = () => {
    // Racers who genuinely crossed keep their places; any remaining podium
    // slot is filled by whoever is furthest along, so ending a race early
    // still awards 2nd place (and its silver chip).
    const crossed = finishOrder.filter((id) => validRacers.some((r) => r.id === id));
    const rest = [...validRacers]
      .filter((r) => !crossed.includes(r.id))
      .sort((a, b) => b.position - a.position)
      .map((r) => r.id);
    const finalOrder = [...crossed, ...rest].slice(0, 2);
    setFinishOrder(finalOrder);
    // Mark the podium as finished so the Track tab shows 1st/2nd badges.
    setRacers((prev) =>
      prev.map((r) => (finalOrder.includes(r.id) ? { ...r, finished: true } : r))
    );
    setStatus("finished");
    setTab("betting");
  };

  // Suggested next turn order: worst board position from the race that just
  // ended goes first (per the rulebook). Must run before positions reset.
  const captureLastRaceOrder = () => {
    if (validRacers.length === 0) {
      setLastRaceOrder(null);
      return;
    }
    const ordered = [...validRacers]
      .sort((a, b) => a.position - b.position)
      .map((r) => ({ name: r.name, player: r.player || "" }));
    setLastRaceOrder(ordered);
  };

  // 2-player variant only: "the player who received the lower number of
  // points in the last race goes first." Points come from this race's gold/
  // silver placements — a player can earn both if their two racers took
  // 1st AND 2nd. Must run before goldPoints/silverPoints are cleared.
  const captureLastRacePoints = () => {
    if (draftVariantId !== "two_player" || draftPlayers.length !== 2) {
      setLastRacePoints(null);
      return;
    }
    const gold = parseFloat(goldPoints) || 0;
    const silver = parseFloat(silverPoints) || 0;
    const totals = {};
    draftPlayers.forEach((p) => {
      totals[p] = 0;
    });
    if (winner?.player) totals[winner.player] = (totals[winner.player] || 0) + gold;
    if (runnerUp?.player) totals[runnerUp.player] = (totals[runnerUp.player] || 0) + silver;
    // Bronze chips are also points received in the race.
    Object.entries(bronzePoints).forEach(([p, v]) => {
      const pts = parseFloat(v) || 0;
      if (pts > 0 && p in totals) totals[p] += pts;
    });
    const list = draftPlayers
      .map((p) => ({ player: p, points: totals[p] || 0 }))
      .sort((a, b) => a.points - b.points);
    setLastRacePoints(list);
  };

  // Advance the active session's race counter; once past the last race,
  // hand off to the champion screen instead of another race setup.
  const advanceSession = () => {
    if (!gameSession) return;
    const nextNum = gameSession.raceNumber + 1;
    setGameSession((s) => (s ? { ...s, raceNumber: nextNum } : s));
    if (nextNum > gameSession.totalRaces) {
      setShowChampion(true);
      return;
    }
    // Rulebook: the board is flipped after each race (Mild, Wild, Mild, Wild).
    // Custom-length tracks are the host's own house rule, so leave those alone.
    if (trackName !== "custom") {
      const next = trackName === "wild" ? "mild" : "wild";
      setTrackName(next);
      setTrackLength(20);
      updateHouseRule("bronzeEnabled", next === "wild");
    }
  };

  // Before a race is retired, note which drafted racers each player just used
  // (so the holdings card can show them as spent). Idempotent per race+racer.
  const recordUsedRacers = () => {
    if (!gameSession || draftPlayers.length === 0) return;
    const raceNo = gameSession.raceNumber;
    setUsedRacers((prev) => {
      const next = { ...prev };
      racers.forEach((r) => {
        if (!r.name.trim() || !draftPlayers.includes(r.player)) return;
        const list = next[r.player] ? [...next[r.player]] : [];
        if (!list.some((u) => u.race === raceNo && u.name === r.name)) {
          list.push({ name: r.name, race: raceNo });
        }
        next[r.player] = list;
      });
      return next;
    });
  };

  const resetRace = () => {
    recordUsedRacers();
    captureLastRaceOrder();
    captureLastRacePoints();
    advanceSession();
    setRacers((prev) =>
      prev.map((r) => ({
        ...r,
        position: 0,
        finished: false,
        place: null,
        // A drafted racer can only be used once — retire the one that just
        // raced so the host has to field a different one from the bench.
        name: draftPlayers.includes(r.player) ? "" : r.name,
      }))
    );
    setFinishOrder([]);
    setTurnLog([]);
    setMoveHistory([]);
    setBets([]);
    setOdds({});
    setStatus("setup");
    setSavedThisRace(false);
    setSaveError(null);
    setGoldPoints("");
    setSilverPoints("");
    setBronzePoints({});
    // Nothing will poll the just-finished race's bets again — sweep them
    // before the raceId moves on, so they don't sit in shared storage forever.
    if (specEnabled && sessionToken) clearSharedUnder(`bet:${sessionToken}:${raceId}:`);
    setRaceId(uid());
    knownBetKeysRef.current = new Set();
  };

  const newRaceKeepPeople = () => {
    recordUsedRacers();
    captureLastRaceOrder();
    captureLastRacePoints();
    advanceSession();
    setRacers((prev) =>
      prev.map((r) => ({
        ...r,
        position: 0,
        finished: false,
        place: null,
        name: draftPlayers.includes(r.player) ? "" : r.name,
      }))
    );
    setFinishOrder([]);
    setTurnLog([]);
    setMoveHistory([]);
    setBets([]);
    setOdds({});
    setStatus("setup");
    setSavedThisRace(false);
    setSaveError(null);
    setGoldPoints("");
    setSilverPoints("");
    setBronzePoints({});
    // Nothing will poll the just-finished race's bets again — sweep them
    // before the raceId moves on, so they don't sit in shared storage forever.
    if (specEnabled && sessionToken) clearSharedUnder(`bet:${sessionToken}:${raceId}:`);
    setRaceId(uid());
    knownBetKeysRef.current = new Set();
    setTab("setup");
  };

  // Field a benched drafted racer for the given player, replacing whatever
  // racer they currently have on the roster and returning the old one to the
  // bench. Keeps "one racer per race" intact across the game's races.
  const fieldDraftedRacer = (playerLabel, racerName) => {
    const existing = racers.find((r) => r.player === playerLabel);
    const replaced = existing ? existing.name : null;

    let next;
    if (existing) {
      next = racers.map((r) =>
        r.player === playerLabel
          ? { ...r, name: racerName, position: 0, finished: false, place: null }
          : r
      );
    } else {
      next = [
        ...racers,
        {
          id: uid(),
          name: racerName,
          player: playerLabel,
          notes: "",
          color: PALETTE[racers.length % PALETTE.length],
          position: 0,
          finished: false,
          place: null,
        },
      ];
    }
    setRacers(next);
    persistRoster(next);

    setDraftedTeams((prev) => {
      if (!prev) return prev;
      return prev
        .map((t) => {
          if (t.player !== playerLabel) return t;
          const bench = t.racers.filter((n) => n !== racerName);
          if (replaced) bench.push(replaced); // returned racer goes back to the bench
          return { ...t, racers: bench };
        })
        .filter((t) => t.racers.length > 0);
    });
  };

  // Champion screen exits
  const startNewGame = () => {
    setShowChampion(false);
    setGameSession(null);
    setDraftedTeams(null);
    setDraftPlayers([]);
    setUsedRacers({});
    setDraftVariantId(null);
    setLastRaceOrder(null);
    setLastRacePoints(null);
    setBronzePoints({});
    setBankrolls({});
    setRacers([emptyRacer(0), emptyRacer(1)]);
    setTab("setup");
  };

  const keepRacingCasually = () => {
    setShowChampion(false);
    setGameSession(null);
    setDraftPlayers([]); // casual play drops the "one racer per race" enforcement
    setUsedRacers({});
    setDraftVariantId(null);
    setLastRacePoints(null);
    setTab("setup");
  };

  const winnerId = finishOrder[0];
  const winner = validRacers.find((r) => r.id === winnerId);
  const runnerUpId = finishOrder[1];
  const runnerUp = validRacers.find((r) => r.id === runnerUpId);

  const totalPool = bets.reduce((s, b) => s + b.amount, 0);
  const poolByRacer = {};
  bets.forEach((b) => {
    poolByRacer[b.racerId] = (poolByRacer[b.racerId] || 0) + b.amount;
  });

  const winnerOdds = winnerId ? odds[winnerId] || 0 : 0;

  const results =
    status === "finished" && winnerId
      ? [...new Set(bets.map((b) => b.bettorName))].map((name) => {
          const theirBets = bets.filter((b) => b.bettorName === name);
          const staked = theirBets.reduce((s, b) => s + b.amount, 0);
          const won = theirBets.reduce((s, b) => {
            const isWin = (b.betType || "win") === "win";
            const hitWin = isWin && b.racerId === winnerId;
            const hitPlace = !isWin && (b.racerId === winnerId || b.racerId === runnerUpId);
            if (!hitWin && !hitPlace) return s;
            const racerWinOdds = odds[b.racerId] || 0;
            const payoutOdds = isWin ? racerWinOdds : placeOddsFor(racerWinOdds);
            return s + b.amount * payoutOdds;
          }, 0);
          return { name, staked, payout: won, net: won - staked };
        })
      : [];

  // Broadcast a read-only race snapshot for spectators, whenever their
  // betting session is on and anything relevant changes.
  useEffect(() => {
    if (!specEnabled || !sessionToken) return;
    const snapshot = {
      raceId,
      status,
      trackLength,
      racers: validRacers.map((r) => ({
        id: r.id,
        name: r.name,
        color: r.color,
        position: r.position,
        finished: r.finished,
        player: r.player,
      })),
      odds,
      finishOrder,
      winnerName: winner ? winner.name : null,
      runnerUpName: runnerUp ? runnerUp.name : null,
      updatedAt: Date.now(),
    };
    window.storage.set(`race:${sessionToken}`, JSON.stringify(snapshot), true).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specEnabled, sessionToken, raceId, status, trackLength, racers, odds, finishOrder]);

  // Poll for bets spectators placed on their own devices and merge them in.
  useEffect(() => {
    if (!specEnabled || !sessionToken) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const listRes = await window.storage.list(`bet:${sessionToken}:${raceId}:`, true);
        const keys = (listRes && listRes.keys) || [];
        const newKeys = keys.filter((k) => !knownBetKeysRef.current.has(k));
        if (newKeys.length === 0) return;
        const fetched = [];
        for (const k of newKeys) {
          try {
            const res = await window.storage.get(k, true);
            if (res) fetched.push(JSON.parse(res.value));
          } catch (e) {
            // skip a bad record
          }
        }
        newKeys.forEach((k) => knownBetKeysRef.current.add(k));
        if (cancelled || fetched.length === 0) return;
        setBets((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          const additions = fetched.filter((b) => !existingIds.has(b.id));
          return additions.length ? [...prev, ...additions] : prev;
        });
      } catch (e) {
        // best effort — try again next tick
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [specEnabled, sessionToken, raceId]);

  const saveToHistory = async () => {
    if (!winner || savedThisRace || savingResult) return;
    setSaveError(null);
    setSavingResult(true);
    const placements = [
      winner && { name: winner.name, player: winner.player || "", place: 1, points: parseFloat(goldPoints) || 0 },
      runnerUp && { name: runnerUp.name, player: runnerUp.player || "", place: 2, points: parseFloat(silverPoints) || 0 },
    ].filter(Boolean);
    // Bronze chips picked up on star spaces — extra points, any player.
    const bonuses = Object.entries(bronzePoints)
      .map(([player, v]) => ({ player, points: parseFloat(v) || 0 }))
      .filter((b) => b.player && b.points > 0);
    const record = {
      id: uid(),
      date: new Date().toISOString(),
      trackLength,
      sessionId: gameSession?.id ?? null,
      racers: validRacers.map((r) => ({ name: r.name, player: r.player || "", color: r.color })),
      finishOrder: finishOrder
        .map((id) => validRacers.find((r) => r.id === id)?.name)
        .filter(Boolean),
      winner: winner.name,
      placements,
      bonuses,
      totalPool,
      results: results.map((r) => ({
        name: r.name,
        staked: r.staked,
        payout: Math.round(r.payout * 100) / 100,
        net: Math.round(r.net * 100) / 100,
      })),
    };
    try {
      await window.storage.set(`race:${record.id}`, JSON.stringify(record), false);
      const combined = [record.id, ...historyIndex];
      const idx = combined.slice(0, 100);
      const droppedIds = combined.slice(100); // fell off the cap — clean up their storage
      await window.storage.set("history-index", JSON.stringify(idx), false);
      setHistoryIndex(idx);
      setSavedThisRace(true);
      droppedIds.forEach((droppedId) => {
        window.storage.delete(`race:${droppedId}`, false).catch(() => {});
      });
      // Apply each bettor's net to their running bankroll — once per race,
      // guarded by the savedThisRace check at the top.
      if (results.length > 0) {
        setBankrolls((prev) => {
          const next = { ...prev };
          results.forEach((r) => {
            next[r.name] = Math.round(((next[r.name] || 0) + r.net) * 100) / 100;
          });
          return next;
        });
      }
    } catch (e) {
      setSaveError("Couldn't save — check your connection and try again.");
    } finally {
      setSavingResult(false);
    }
  };

  return (
    <div
      className="min-h-screen"
      style={{ ...themeVars(theme), background: "var(--bg)", fontFamily: "'Nunito', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Nunito:wght@400;600;700;800&family=IBM+Plex+Mono:wght@500;600&display=swap');
        .font-display { font-family: 'Luckiest Guy', cursive; font-weight: 400; letter-spacing: 0.02em; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .comic-title {
          -webkit-text-stroke: 2.5px #1A1408;
          paint-order: stroke fill;
          text-shadow: 4px 4px 0px #1A1408;
        }
        input[type=range] { accent-color: var(--yellow); }
        /* Touch targets: every tappable control is at least 48x48px. Applied
           globally so new buttons and inputs can't regress it. Controls that
           are visually smaller than 48px (switches, colour swatches) keep
           their look by drawing it on an inner element; the button itself is
           the 48px hit area. */
        button, [role="button"] { min-height: 48px; min-width: 48px; }
        input:not([type="checkbox"]):not([type="radio"]), select, textarea { min-height: 48px; }
        @keyframes trophyGlow {
          0%, 100% { filter: drop-shadow(0 0 2px var(--yellow)) brightness(1); transform: scale(1); }
          50% { filter: drop-shadow(0 0 14px var(--yellow)) brightness(1.15); transform: scale(1.08); }
        }
        .trophy-glow { animation: trophyGlow 1.8s ease-in-out infinite; }
        @keyframes nextTurnPulse {
          0%, 100% { box-shadow: 5px 5px 0px var(--ink), 0 0 0px var(--yellow); transform: scale(1); }
          50% { box-shadow: 5px 5px 0px var(--ink), 0 0 16px 2px var(--yellow); transform: scale(1.015); }
        }
        .next-turn-ready { animation: nextTurnPulse 1.4s ease-in-out infinite; }
        @keyframes winnerPop {
          0% { opacity: 0; transform: scale(0.85) translateY(6px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        .winner-pop { animation: winnerPop 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes confettiFall {
          0% { transform: translateY(-10px) rotate(0deg); opacity: 1; }
          100% { transform: translateY(140px) rotate(360deg); opacity: 0; }
        }
        .confetti-piece { animation: confettiFall 1.6s ease-in forwards; }
        @keyframes diceTumble {
          0%   { transform: rotate(0deg) scale(1); }
          25%  { transform: rotate(-18deg) scale(1.12); }
          50%  { transform: rotate(14deg) scale(0.95); }
          75%  { transform: rotate(-8deg) scale(1.06); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .dice-tumble { animation: diceTumble 0.5s ease-in-out; }

        /* Draft roll-off: a hard cup-shake while faces flicker, then a
           squash-and-bounce landing when the real result is revealed. */
        @keyframes diceShake {
          0%   { transform: translate(0, 0) rotate(0deg); }
          10%  { transform: translate(-5px, -7px) rotate(-16deg); }
          20%  { transform: translate(6px, 3px) rotate(14deg); }
          30%  { transform: translate(-4px, -9px) rotate(-10deg) scale(1.08); }
          40%  { transform: translate(7px, 2px) rotate(18deg); }
          50%  { transform: translate(-6px, -5px) rotate(-14deg) scale(1.1); }
          60%  { transform: translate(5px, 4px) rotate(10deg); }
          70%  { transform: translate(-3px, -8px) rotate(-18deg) scale(1.06); }
          80%  { transform: translate(6px, 1px) rotate(12deg); }
          90%  { transform: translate(-2px, -4px) rotate(-6deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        .dice-shake { animation: diceShake 0.42s linear infinite; }
        @keyframes diceLand {
          0%   { transform: scale(1.45) rotate(-14deg); box-shadow: 0 0 0 0 var(--highlight); }
          45%  { transform: scale(0.88) rotate(5deg); }
          70%  { transform: scale(1.08) rotate(-2deg); box-shadow: 0 0 0 9px transparent; }
          100% { transform: scale(1) rotate(0deg); }
        }
        .dice-land { animation: diceLand 0.5s cubic-bezier(0.2, 0.8, 0.3, 1) both; }

        /* Landing screen */
        @keyframes lpTitleDrop {
          0%   { opacity: 0; transform: translateY(-28px) rotate(-7deg) scale(0.88); }
          60%  { opacity: 1; transform: translateY(4px) rotate(-1deg) scale(1.03); }
          100% { opacity: 1; transform: translateY(0) rotate(-2deg) scale(1); }
        }
        .lp-title { animation: lpTitleDrop 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
        @keyframes lpRise {
          0%   { opacity: 0; transform: translateY(22px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        /* "backwards", not "both": a held end-state transform would override every
           hover/press transform on these elements (animations beat normal rules). */
        .lp-rise { animation: lpRise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
        /* Idle glow on the Host ticket. Uses filter (not box-shadow) so the
           hover/press shadow changes below stay free to animate. */
        @keyframes lpTicketGlow {
          0%, 100% { filter: drop-shadow(0 0 0 rgba(244, 185, 59, 0)); }
          50% { filter: drop-shadow(0 0 12px rgba(244, 185, 59, 0.85)); }
        }
        /* Same element also uses .lp-rise, so both animations are listed here —
           a second "animation:" rule would otherwise replace the rise-in. */
        .lp-host-ticket {
          animation: lpRise 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) backwards,
                     lpTicketGlow 2.6s ease-in-out 1.4s infinite;
        }
        @keyframes lpStamp {
          0%   { opacity: 0; transform: translate(-50%, -50%) scale(2.4) rotate(-20deg); }
          55%  { opacity: 1; transform: translate(-50%, -50%) scale(0.9) rotate(-9deg); }
          100% { opacity: 1; transform: translate(-50%, -50%) scale(1) rotate(-11deg); }
        }
        .lp-stamp { animation: lpStamp 0.2s cubic-bezier(0.2, 0.9, 0.3, 1) both; }
        /* Ticket tear: the stub is its own piece of card. It swings down on
           its right-hand corner, so the perforation opens into a wedge from the
           left notch: a partial tear, still hanging on. Both pieces get their
           own offset shadow while apart. */
        @keyframes lpTear {
          0%   { transform: none; }
          70%  { transform: translateY(3px) rotate(-3.4deg); }
          100% { transform: translateY(2px) rotate(-3deg); }
        }
        .lp-tearing { box-shadow: none !important; transition: none !important; }
        .lp-tearing .lp-piece { box-shadow: 5px 5px 0px var(--ink); }
        .lp-stub-tear { transform-origin: 100% 0; animation: lpTear 0.34s cubic-bezier(0.3, 0.8, 0.3, 1) forwards; }
        @keyframes lpLeave {
          to { opacity: 0; transform: translateY(-10px) scale(0.98); }
        }
        .lp-leave { animation: lpLeave 0.3s cubic-bezier(0.4, 0, 1, 1) forwards; pointer-events: none; }
        @keyframes lpShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-7px); }
          40% { transform: translateX(6px); }
          60% { transform: translateX(-4px); }
          80% { transform: translateX(2px); }
        }
        .lp-shake { animation: lpShake 0.35s ease-in-out; }
        @keyframes lpSquash {
          0%   { transform: scale(1); }
          40%  { transform: scale(0.965, 0.94) translateY(3px); }
          100% { transform: scale(1); }
        }
        .lp-squash { animation: lpSquash 0.3s ease-out; }
        /* Arrival after picking a role: direct children rise in one by one.
           "backwards" fill so nothing keeps a lingering transform afterwards. */
        @keyframes lpArrive {
          0%   { opacity: 0; transform: translateY(16px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .lp-arrive > * { animation: lpArrive 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
        .lp-arrive > *:nth-child(2) { animation-delay: 0.07s; }
        .lp-arrive > *:nth-child(3) { animation-delay: 0.14s; }
        .lp-arrive > *:nth-child(4) { animation-delay: 0.21s; }
        .lp-arrive > *:nth-child(n+5) { animation-delay: 0.28s; }
        @keyframes lpSettle {
          0%   { opacity: 0.5; transform: scale(1.22) rotate(-2deg); }
          100% { opacity: 1; transform: scale(1) rotate(-2deg); }
        }
        .lp-settle { animation: lpSettle 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) backwards; }
        /* Idle sparkle on the wordmark: four small stars around the title
           twinkle one at a time. Each star is invisible for most of its cycle
           and the cycles are offset, so the logo is mostly still. */
        @keyframes maSparkle {
          0%, 68%, 100% { opacity: 0; transform: scale(0) rotate(0deg); }
          78%           { opacity: 1; transform: scale(1.15) rotate(40deg); }
          90%           { opacity: 0.9; transform: scale(0.7) rotate(80deg); }
        }
        .ma-sparkle { position: absolute; pointer-events: none; opacity: 0; animation: maSparkle 5s ease-in-out infinite; }
        /* Letter bounce on the wordmark: each letter hops a few pixels in turn,
           left to right, then the title rests before the next pass. */
        @keyframes maLetter {
          0%, 40%, 100% { transform: translateY(0); }
          12%           { transform: translateY(-5px); }
          24%           { transform: translateY(1px); }
          32%           { transform: translateY(-1px); }
        }
        .ma-letter { display: inline-block; animation: maLetter 3.6s ease-in-out infinite; }
        /* Finish-line wipe, once on a first visit: a checkered flag carries the
           reveal edge across the title, then swooshes off to the right. The
           flag's left edge and the clip edge move together (both are percent
           of the title's width plus the flag's width), so no measuring is
           needed. */
        @keyframes maReveal {
          from { clip-path: inset(-20px calc(100% + 2.9em) -20px -12px); }
          to   { clip-path: inset(-20px -12px -20px -12px); }
        }
        .ma-reveal { animation: maReveal 1.1s cubic-bezier(0.45, 0, 0.35, 1) 0.35s both; }
        @keyframes maSweep {
          0%     { left: -2.9em; opacity: 1; transform: skewX(-8deg) scaleX(1); filter: blur(0); animation-timing-function: cubic-bezier(0.45, 0, 0.35, 1); }
          75.86% { left: 100%; opacity: 1; transform: skewX(-8deg) scaleX(1); filter: blur(0); animation-timing-function: cubic-bezier(0.55, 0, 1, 0.6); }
          100%   { left: calc(100% + 5.4em); opacity: 0; transform: skewX(-8deg) scaleX(1.7); filter: blur(3px); }
        }
        .ma-flag {
          position: absolute; box-sizing: border-box; z-index: 2; pointer-events: none; opacity: 0;
          top: 50%; height: 1.25em; margin-top: -0.625em; left: -2.9em; width: 2.9em;
          border: 3px solid #1A1408; box-shadow: 3px 3px 0 #1A1408;
          background: repeating-conic-gradient(#1A1408 0% 25%, #FFFCF5 0% 50%) 0 0 / 0.4167em 0.4167em;
          background-origin: border-box; transform: skewX(-8deg); transform-origin: 0 50%;
          animation: maSweep 1.45s linear 0.35s forwards;
        }
        .lp-press { transition: transform 0.12s ease, box-shadow 0.12s ease; }
        .lp-press:active { transform: translate(3px, 3px) scale(0.99); box-shadow: 2px 2px 0px var(--ink) !important; }
        /* ---- Interactive landing cards ----
           Every device: pressing squashes the card and sends a ripple from the
           touch/click point. Mouse (hover + fine pointer) only: the card lifts,
           tilts toward the cursor, a shine sweeps across and the emoji wiggles.
           Touch devices never get the hover rules, so nothing "sticks" after a tap. */
        .lp-ticket, .lp-slip { box-shadow: 5px 5px 0px var(--ink); -webkit-tap-highlight-color: transparent; }
        .lp-ticket {
          cursor: pointer;
          transform: perspective(800px) rotateX(var(--tx, 0deg)) rotateY(var(--ty, 0deg))
                     translateY(var(--lift, 0px)) scale(var(--sc, 1));
          transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.18s ease;
        }
        .lp-slip { transition: transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.18s ease; }
        .lp-ticket:active, .lp-ticket[data-pressed] { --sc: 0.97; --lift: 3px; box-shadow: 2px 2px 0px var(--ink); transition-duration: 0.07s; }
        .lp-cta { transition: transform 0.18s ease, box-shadow 0.18s ease; }
        .lp-chev { transition: transform 0.18s ease; }
        .lp-shine {
          position: absolute; top: 0; bottom: 0; left: -45%; width: 35%; opacity: 0; pointer-events: none;
          background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.6), transparent);
          transform: skewX(-18deg);
        }
        @keyframes lpShine {
          0%   { left: -45%; opacity: 0; }
          15%  { opacity: 1; }
          100% { left: 125%; opacity: 0; }
        }
        @keyframes lpWiggle {
          0%, 100% { transform: rotate(0deg) scale(1); }
          25% { transform: rotate(-14deg) scale(1.12); }
          50% { transform: rotate(10deg) scale(1.06); }
          75% { transform: rotate(-6deg) scale(1.03); }
        }
        @keyframes lpRipple {
          0%   { transform: translate(-50%, -50%) scale(0); opacity: 0.4; }
          100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
        }
        .lp-ripple {
          position: absolute; border-radius: 50%; background: var(--ink); pointer-events: none;
          animation: lpRipple 0.55s ease-out forwards;
        }
        .lp-code-input { transition: border-color 0.15s ease, box-shadow 0.15s ease; }
        .lp-code-input:focus { outline: none; border-color: var(--purple) !important; box-shadow: 0 0 0 4px rgba(143, 114, 196, 0.35); }
        .lp-ticket:focus-visible, .lp-slip button:focus-visible { outline: 4px solid var(--yellow); outline-offset: 4px; }
        @media (hover: none) {
          .lp-ticket:active .lp-shine, .lp-ticket[data-pressed] .lp-shine { animation: lpShine 0.5s ease-out; }
        }
        @media (hover: hover) and (pointer: fine) {
          .lp-ticket:hover { --lift: -5px; box-shadow: 9px 11px 0px var(--ink); }
          .lp-ticket:hover:active, .lp-ticket:hover[data-pressed] { --lift: 2px; --sc: 0.97; box-shadow: 2px 2px 0px var(--ink); }
          .lp-ticket:hover .lp-shine { animation: lpShine 0.75s ease-out; }
          .lp-ticket:hover .lp-emoji, .lp-slip:hover .lp-emoji { animation: lpWiggle 0.6s ease-in-out; }
          .lp-ticket:hover .lp-cta { transform: translateX(4px); box-shadow: 5px 5px 0px var(--ink) !important; }
          .lp-slip:hover { transform: translateY(-3px); box-shadow: 8px 9px 0px var(--ink); }
          .lp-code-input:hover { border-color: var(--purple) !important; }
          .lp-press:hover { filter: brightness(1.08); }
          .lp-press:hover .lp-chev { transform: translateX(3px); }
        }
        @keyframes rankPop {
          0%   { opacity: 0; transform: scale(0.4); }
          60%  { opacity: 1; transform: scale(1.3); }
          100% { opacity: 1; transform: scale(1); }
        }
        .rank-pop { animation: rankPop 0.3s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .rank-pop, .lp-stamp, .lp-squash, .lp-stub-tear, .lp-leave, .lp-shake, .lp-settle, .lp-arrive > * { animation: none !important; }
          .dice-shake, .dice-land { animation: none !important; }
          .lp-title, .lp-rise, .lp-host-ticket { animation: none !important; }
          .ma-letter, .ma-reveal { animation: none !important; }
          .ma-flag { display: none; }
          .ma-sparkle { display: none; }
          .lp-press { transition: none; }
          /* Motion off: keep colour/shadow feedback, drop movement and effects. */
          .lp-ticket, .lp-ticket:hover, .lp-ticket:active, .lp-ticket[data-pressed], .lp-slip:hover { transform: none !important; }
          .lp-emoji, .lp-shine { animation: none !important; }
          .lp-ripple, .lp-shine { display: none; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto px-4 pb-24">
        {/* Slim top bar: settings + help in the upper right. Lives above the hero
            (not below it) so the start options sit higher on phones, and the
            panels open directly under the buttons that opened them. */}
        <div className="flex items-center justify-end pt-2">
          <ChromeButton onClick={() => setShowSettings((v) => !v)} label="Settings">
            ⚙
          </ChromeButton>
          <ChromeButton onClick={() => setShowHelp((v) => !v)} label="How this app works">
            ?
          </ChromeButton>
        </div>
        {showSettings && (
          <SettingsPanel
            houseRules={houseRules}
            updateHouseRule={updateHouseRule}
            themeId={themeId}
            changeTheme={changeTheme}
            onClose={() => setShowSettings(false)}
          />
        )}
        {showHelp && <HelpPanel onClose={() => setShowHelp(false)} />}

        {mode === null ? (
          <LandingHero
            ready={ready && onboardingLoaded}
            skipFlag={!!resumeInfo || historyIndex.length > 0}
          />
        ) : <Header status={mode === "host" ? status : null} />}

        {mode === null && onboardingLoaded && ready && !onboardingSeen["intro-tour"] && !savedSession && historyIndex.length === 0 && (
          <IntroTour onDone={() => dismissOnboarding("intro-tour")} />
        )}

        {mode === null && !(ready && onboardingLoaded) && (
          <p className="text-center font-mono text-xs lp-rise" style={{ color: "var(--onBg)", animationDelay: "0.4s" }}>
            Warming up the track…
          </p>
        )}

        {mode === null && ready && onboardingLoaded && (
          <ModeChooser
            historyIndex={historyIndex}
            resume={resumeInfo}
            leaving={leaving}
            onHost={() => transitionTo(() => setMode("host"))}
            onJoin={(pin) =>
              transitionTo(() => {
                setJoinPin(pin || "");
                setMode("spectator");
              })
            }
          />
        )}

        {/* key={mode}: re-runs the staggered arrival each time a role is entered */}
        {mode !== null && (
        <ArriveOnce key={mode}>
        {mode === "spectator" && (
          <SpectatorView
            initialPin={joinPin}
            onLeave={() => {
              setJoinPin("");
              setMode(null);
            }}
          />
        )}

        {mode === "host" && showChampion && gameSession && (
          <GameCompleteScreen
            historyIndex={historyIndex}
            sessionId={gameSession.id}
            onNewGame={startNewGame}
            onKeepRacing={keepRacingCasually}
          />
        )}

        {mode === "host" && !showChampion && (
          <>
            <TabBar tab={tab} setTab={setTab} status={status} />

            {tab === "setup" && showDraft && (
              <DraftAssistant
                onApply={applyDraft}
                onCancel={() => setShowDraft(false)}
                onboardingSeen={onboardingSeen}
                dismissOnboarding={dismissOnboarding}
                usedRacers={usedRacers}
              />
            )}

            {tab === "setup" && !showDraft && (
              <SetupTab
                racers={racers}
                addRacer={addRacer}
                updateRacer={updateRacer}
                removeRacer={removeRacer}
                trackLength={trackLength}
                setTrackLength={setTrackLength}
                trackName={trackName}
                setTrackName={setTrackName}
                updateHouseRule={updateHouseRule}
                status={status}
                startRace={startRace}
                validCount={validRacers.length}
                onStartDraft={() => setShowDraft(true)}
                draftedTeams={draftedTeams}
                fieldDraftedRacer={fieldDraftedRacer}
                gameSession={gameSession}
                draftVariantId={draftVariantId}
                lastRaceOrder={lastRaceOrder}
                lastRacePoints={lastRacePoints}
                draftPlayers={draftPlayers}
                usedRacers={usedRacers}
                onboardingSeen={onboardingSeen}
                dismissOnboarding={dismissOnboarding}
              />
            )}

            {tab === "betting" && (
              <BettingTab
                status={status}
                bettors={bettors}
                newBettorName={newBettorName}
                setNewBettorName={setNewBettorName}
                addBettor={addBettor}
                removeBettor={removeBettor}
                racers={validRacers}
                betBettor={betBettor}
                setBetBettor={setBetBettor}
                betRacer={betRacer}
                setBetRacer={setBetRacer}
                betAmount={betAmount}
                setBetAmount={setBetAmount}
                betType={betType}
                setBetType={setBetType}
                placeBet={placeBet}
                bets={bets}
                removeBet={removeBet}
                poolByRacer={poolByRacer}
                totalPool={totalPool}
                winner={winner}
                runnerUp={runnerUp}
                results={results}
                winnerOdds={winnerOdds}
                odds={odds}
                rollOdds={rollOdds}
                oddsLocked={oddsLocked}
                saveToHistory={saveToHistory}
                savedThisRace={savedThisRace}
                savingResult={savingResult}
                saveError={saveError}
                newRaceKeepPeople={newRaceKeepPeople}
                goldPoints={goldPoints}
                setGoldPoints={setGoldPoints}
                silverPoints={silverPoints}
                setSilverPoints={setSilverPoints}
                specEnabled={specEnabled}
                sessionPin={sessionPin}
                enableSpectatorBetting={enableSpectatorBetting}
                disableSpectatorBetting={disableSpectatorBetting}
                gameSession={gameSession}
                bronzePoints={bronzePoints}
                setBronzePoints={setBronzePoints}
                bankrolls={bankrolls}
                turnLog={turnLog}
                trackLength={trackLength}
                onboardingSeen={onboardingSeen}
                dismissOnboarding={dismissOnboarding}
                houseRules={houseRules}
              />
            )}

            {tab === "track" && (
              <TrackTab
                racers={racers.filter((r) => r.name.trim())}
                trackLength={trackLength}
                status={status}
                moveRacer={moveRacer}
                setPositionDirect={setPositionDirect}
                turnLog={turnLog}
                endRaceNow={endRaceNow}
                finishOrder={finishOrder}
                resetRace={resetRace}
                savedThisRace={savedThisRace}
                moveHistory={moveHistory}
                undoLastMove={undoLastMove}
                gameSession={gameSession}
                activeRacerId={activeRacerId}
                setActiveRacer={setActiveTurn}
                advanceTurn={advanceTurn}
                turnHasMoved={turnHasMoved}
                onboardingSeen={onboardingSeen}
                dismissOnboarding={dismissOnboarding}
              />
            )}

            {tab === "dice" && <DiceTab />}

            {tab === "history" && (
              <HistoryTab
                historyIndex={historyIndex}
                setHistoryIndex={setHistoryIndex}
                activeSessionId={gameSession?.id ?? null}
              />
            )}
          </>
        )}
        </ArriveOnce>
        )}
      </div>
    </div>
  );
}

// Staggered arrival for the screen shown right after picking a role. The class
// is dropped after the animation so tab switches later on never re-animate.
function ArriveOnce({ children }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 1100);
    return () => clearTimeout(t);
  }, []);
  return <div className={done ? "" : "lp-arrive"}>{children}</div>;
}

// First-time contextual help. One storage key holds every dismissal as a
// single object — not one write per tip — so it stays cheap and never
// re-nags once "Got it" is tapped. Personal (non-shared) storage means host
// and spectator devices track their own dismissals independently for free.
function useOnboarding() {
  const [seen, setSeen] = useState(null); // null until storage has answered

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("onboarding-seen", false);
        setSeen(r ? JSON.parse(r.value) : {});
      } catch (e) {
        setSeen({});
      }
    })();
  }, []);

  const dismiss = (id) => {
    setSeen((prev) => {
      const next = { ...(prev || {}), [id]: true };
      window.storage.set("onboarding-seen", JSON.stringify(next), false).catch(() => {});
      return next;
    });
  };

  // `loaded` lets callers avoid flashing a first-visit UI before storage replies.
  return { seen: seen || {}, dismiss, loaded: seen !== null };
}

function OnboardingBanner({ id, seen, dismiss, children }) {
  if (seen[id]) return null;
  return (
    <div
      className="rounded-lg p-3 mb-3 flex items-start gap-2"
      style={{ background: "var(--highlight)", border: "2px solid var(--ink)" }}
    >
      <span style={{ fontSize: 16, lineHeight: 1 }}>💡</span>
      <div className="flex-1">
        <p className="text-xs" style={{ color: "var(--ink)" }}>
          {children}
        </p>
        <button
          onClick={() => dismiss(id)}
          className="mt-1.5 text-xs font-mono font-semibold underline"
          style={{ color: "var(--red)" }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}

// Wraps the "Magical Athlete" wordmark and adds a few twinkling stars around
// it. The stars are absolutely positioned, so they take no layout space, and
// they are decorative: hidden from assistive tech and switched off under
// prefers-reduced-motion (see .ma-sparkle in the stylesheet).
const LOGO_STARS = [
  { left: "-3%", top: "-10%", size: 20, delay: "0s" },
  { right: "1%", top: "-18%", size: 13, delay: "1.6s" },
  { right: "-4%", bottom: "-2%", size: 17, delay: "3.1s" },
  { left: "24%", bottom: "-16%", size: 11, delay: "2.3s" },
];

// Splits a title into per-letter spans so each letter can bounce on its own
// delay. Words stay together (no break inside a word); the letters are
// hidden from assistive tech and the full text is read once instead.
function BounceText({ text, base = 0 }) {
  let n = 0;
  const words = text.split(" ");
  return (
    <>
      <span
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          overflow: "hidden",
          clip: "rect(0 0 0 0)",
          whiteSpace: "nowrap",
        }}
      >
        {text}
      </span>
      <span aria-hidden="true">
        {words.map((word, wi) => (
          <React.Fragment key={wi}>
            {wi > 0 ? " " : null}
            <span style={{ display: "inline-block", whiteSpace: "nowrap" }}>
              {word.split("").map((ch) => {
                const delay = `${(base + n++ * 0.07).toFixed(2)}s`;
                return (
                  <span key={n} className="ma-letter" style={{ animationDelay: delay }}>
                    {ch}
                  </span>
                );
              })}
            </span>
          </React.Fragment>
        ))}
      </span>
    </>
  );
}

function LogoSparkles({ children, base = 0 }) {
  return (
    <span className="relative inline-block">
      {children}
      {LOGO_STARS.map((s, i) => (
        <svg
          key={i}
          aria-hidden="true"
          className="ma-sparkle"
          viewBox="0 0 24 24"
          width={s.size}
          height={s.size}
          style={{
            left: s.left,
            right: s.right,
            top: s.top,
            bottom: s.bottom,
            animationDelay: `${(base + parseFloat(s.delay)).toFixed(2)}s`,
            animationDuration: `${4.8 + i * 0.3}s`,
          }}
        >
          <path
            d="M12 0 C12.8 7 17 11.2 24 12 C17 12.8 12.8 17 12 24 C11.2 17 7 12.8 0 12 C7 11.2 11.2 7 12 0 Z"
            fill="var(--yellow)"
            stroke="#1A1408"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      ))}
    </span>
  );
}

function Header({ status }) {
  const statusLabel =
    status === "setup"
      ? "Setting up"
      : status === "racing"
      ? "Race in progress"
      : status === "finished"
      ? "Race finished"
      : "Racing game companion";
  return (
    <div className="pt-2 pb-5 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Sparkles size={16} color="var(--yellow)" />
        <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "var(--yellow)" }}>
          Track &amp; Wager
        </span>
        <Sparkles size={16} color="var(--yellow)" />
      </div>
      <LogoSparkles>
        <h1
          className="font-display comic-title lp-settle text-5xl sm:text-6xl inline-block"
          style={{ color: "#FFFCF5", letterSpacing: "0.01em", transform: "rotate(-2deg)" }}
        >
          <BounceText text="Magical Athlete" />
        </h1>
      </LogoSparkles>
      <p className="font-mono text-xs mt-2" style={{ color: "var(--onBg)" }}>
        {statusLabel}
      </p>
    </div>
  );
}

// Segmented Poster/Calm control for the settings panel. Each segment is a
// 48px-tall hit area; the visible pill is drawn by the inner span, with an
// even 3px inset inside a 36px track so it never sits flush to an edge.
function ThemeSwitcher({ themeId, changeTheme }) {
  return (
    <div role="group" aria-label="Theme" className="relative inline-flex items-center px-1">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 rounded-full"
        style={{
          top: "50%",
          height: 36,
          transform: "translateY(-50%)",
          background: "var(--highlight)",
          border: "1.5px solid var(--ink)",
        }}
      />
      {Object.entries(THEMES).map(([id, t]) => {
        const active = themeId === id;
        return (
          <button
            key={id}
            onClick={() => changeTheme(id)}
            aria-pressed={active}
            className="relative flex items-center justify-center"
            style={{ background: "transparent", border: "none" }}
          >
            <span
              className="flex items-center justify-center rounded-full px-4 text-xs font-mono font-semibold"
              style={{
                height: 30,
                background: active ? "var(--ink)" : "transparent",
                color: active ? "var(--paper)" : "var(--ink)",
              }}
            >
              {t.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Round icon button for the top bar: 36px circle inside a 48px hit area.
function ChromeButton({ onClick, label, children }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="shrink-0 flex items-center justify-center"
      style={{ background: "transparent", border: "none" }}
    >
      <span
        className="flex items-center justify-center rounded-full text-sm font-mono font-bold"
        style={{
          width: 36,
          height: 36,
          background: "var(--paper)",
          color: "var(--ink)",
          border: "1.5px solid var(--onBgMuted)",
        }}
      >
        {children}
      </span>
    </button>
  );
}

// On/off switch. The button is the 48px-high hit area; the visible 44x26
// track is drawn by the inner span so the switch looks the same as before.
function SwitchButton({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="shrink-0 flex items-center justify-center"
      style={{ minWidth: 56, minHeight: 48, background: "transparent", border: "none" }}
    >
      <span
        className="block rounded-full transition-colors"
        style={{
          width: 44,
          height: 26,
          background: checked ? "var(--green)" : "var(--highlight)",
          border: "2px solid var(--ink)",
          position: "relative",
        }}
      >
        <span
          className="rounded-full block"
          style={{
            width: 18,
            height: 18,
            background: "var(--paper2)",
            border: "1.5px solid var(--ink)",
            position: "absolute",
            top: 2,
            left: checked ? 22 : 2,
            transition: "left 0.15s",
          }}
        />
      </span>
    </button>
  );
}

function SettingsToggle({ label, hint, checked, onChange }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer mb-3">
      <SwitchButton checked={checked} onChange={onChange} label={label} />
      <div>
        <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
          {label}
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          {hint}
        </p>
      </div>
    </label>
  );
}

function SettingsPanel({ houseRules, updateHouseRule, themeId, changeTheme, onClose }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle icon={Flag}>Settings</SectionTitle>
        <button onClick={onClose} className="text-xs" style={{ color: "var(--muted)" }}>
          Close
        </button>
      </div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            Look
          </p>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Poster is bold and bright; Calm is quieter.
          </p>
        </div>
        <ThemeSwitcher themeId={themeId} changeTheme={changeTheme} />
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
        House rules
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        Table-level preferences for tonight — saved on this device, applied on the Betting tab.
      </p>
      <SettingsToggle
        label="Betting"
        hint="Turn off for groups that just want to race — hides odds, bets, and payouts."
        checked={houseRules.bettingEnabled}
        onChange={(v) => updateHouseRule("bettingEnabled", v)}
      />
      <SettingsToggle
        label="Bronze chips"
        hint="Star-space bonus points from the Wild Wilds track. Turn off if you're not using that side."
        checked={houseRules.bronzeEnabled}
        onChange={(v) => updateHouseRule("bronzeEnabled", v)}
      />
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Want a shorter game? The race count is set per-draft — look for it when you run a draft.
      </p>
    </Card>
  );
}

function HelpPanel({ onClose }) {
  return (
    <Card>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle icon={Flag}>How this app works</SectionTitle>
        <button onClick={onClose} className="text-xs" style={{ color: "var(--muted)" }}>
          Close
        </button>
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
        Game flow
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        Draft or add racers → start the race → move racers as you roll → race ends when 2 cross
        the line → award chips → save → next race → standings.
      </p>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
        What's from the rulebook vs. this app
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        Drafting, racing, and chip scoring follow the physical rulebook. Betting, spectator join
        codes, session tracking, and instant replay are extras this app adds — nothing you need a
        physical component for.
      </p>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
        Hosting vs. spectating
      </p>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        One device hosts and runs the race. Anyone else can open this same link, tap "Join with a
        code," and bet from their own phone using the code the host shows them.
      </p>
    </Card>
  );
}

// First thing anyone sees. Replaces <Header> while no role is picked yet.
// A first-time visitor gets the finish-line flag wipe on the title once per
// page load; anyone with a saved game or race history, and anyone who prefers
// reduced motion, sees the title straight away. Tapping the title replays it.
let maFlagPlayed = false;

function LandingHero({ ready = true, skipFlag = false }) {
  // "wait" keeps the title hidden until we know whether to play the wipe, so
  // returning players never see it flash and then disappear.
  const [phase, setPhase] = useState("wait");
  // Tapping the title replays the wipe (changing the key restarts every
  // animation inside it), so it can be shown again on demand.
  const [replayN, setReplayN] = useState(0);
  const replay = () => {
    if (prefersReducedMotion()) return;
    maFlagPlayed = true;
    setPhase("play");
    setReplayN((n) => n + 1);
  };
  useEffect(() => {
    if (phase !== "wait") return undefined;
    const decide = () => {
      if (skipFlag || maFlagPlayed || prefersReducedMotion()) {
        setPhase("skip");
      } else {
        maFlagPlayed = true;
        setPhase("play");
      }
    };
    if (ready) {
      decide();
      return undefined;
    }
    const t = setTimeout(decide, 900);
    return () => clearTimeout(t);
  }, [ready, skipFlag, phase]);
  const play = phase === "play";
  const base = play ? 1.6 : 0;
  return (
    <div className="pt-2 pb-4 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <Sparkles size={16} color="var(--yellow)" />
        <span className="font-mono text-xs tracking-widest uppercase" style={{ color: "var(--yellow)" }}>
          Track &amp; Wager
        </span>
        <Sparkles size={16} color="var(--yellow)" />
      </div>
      <LogoSparkles base={base}>
        <h1
          className="relative font-display comic-title lp-title text-5xl sm:text-6xl inline-block cursor-pointer"
          style={{ color: "#FFFCF5", letterSpacing: "0.01em", transform: "rotate(-2deg)" }}
          onClick={replay}
        >
          <span
            key={`t${replayN}`}
            className={play ? "ma-reveal" : undefined}
            style={{ display: "inline-block", opacity: phase === "wait" ? 0 : 1 }}
          >
            <BounceText text="Magical Athlete" base={base} />
          </span>
          {play && <span key={`f${replayN}`} className="ma-flag" aria-hidden="true" />}
        </h1>
      </LogoSparkles>
      <p className="font-mono text-xs mt-3 lp-rise" style={{ color: "var(--onBg)", animationDelay: "0.35s" }}>
        The race book for game night
      </p>
    </div>
  );
}

// One-time welcome: three swipeable cards (draft → race → bet). Native
// scroll-snap does the swiping; the dots and Next button just follow it.
// Dismissal is stored once under "intro-tour" via useOnboarding, so it never
// returns on that device. Skipped for anyone with an in-progress saved game.
const INTRO_SLIDES = [
  {
    emoji: "🎲",
    title: "Draft your racers",
    body: "Run the official pre-game draft, or just add racers by hand. Each player gets a team.",
  },
  {
    emoji: "🏁",
    title: "Run the race",
    body: "Tap to move racers as you roll. The race ends when two cross the line, then chips are awarded.",
  },
  {
    emoji: "🎟️",
    title: "Bet from any phone",
    body: "Share the 4-digit code. Friends join on their own phones and wager on the winner.",
  },
];

function IntroTour({ onDone }) {
  const scroller = useRef(null);
  const [index, setIndex] = useState(0);
  const last = index === INTRO_SLIDES.length - 1;

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };
  const next = () => {
    const el = scroller.current;
    if (!el) return;
    if (last) {
      onDone();
      return;
    }
    el.scrollTo({ left: (index + 1) * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to Magical Athlete"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(10,6,0,0.72)" }}
    >
      <div
        className="lp-rise w-full rounded-2xl overflow-hidden"
        style={{
          maxWidth: 360,
          background: "var(--paper2)",
          border: "4px solid var(--ink)",
          boxShadow: "6px 6px 0px var(--ink)",
        }}
      >
        <div
          className="px-4 py-1.5 flex items-center justify-between"
          style={{ background: "var(--yellow)", borderBottom: "4px solid var(--ink)" }}
        >
          <span className="font-mono text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--ink)" }}>
            Welcome · {index + 1} of {INTRO_SLIDES.length}
          </span>
          <button
            type="button"
            onClick={onDone}
            className="font-mono text-xs font-semibold underline px-2"
            style={{ color: "var(--ink)" }}
          >
            Skip
          </button>
        </div>

        <div
          ref={scroller}
          onScroll={onScroll}
          className="flex overflow-x-auto"
          style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
        >
          {INTRO_SLIDES.map((s) => (
            <div
              key={s.title}
              className="shrink-0 w-full px-6 pt-7 pb-5 text-center"
              style={{ scrollSnapAlign: "center" }}
            >
              <span
                className="mx-auto flex items-center justify-center rounded-full text-5xl"
                style={{ width: 88, height: 88, background: "var(--highlight)", border: "3px solid var(--ink)" }}
              >
                {s.emoji}
              </span>
              <p className="font-display text-2xl mt-4" style={{ color: "var(--ink)" }}>
                {s.title}
              </p>
              <p className="text-sm mt-2" style={{ color: "var(--muted)", minHeight: 60 }}>
                {s.body}
              </p>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between px-4 pb-4">
          <div className="flex items-center gap-2" aria-hidden="true">
            {INTRO_SLIDES.map((_, i) => (
              <span
                key={i}
                className="rounded-full"
                style={{
                  width: i === index ? 22 : 10,
                  height: 10,
                  background: i === index ? "var(--red)" : "var(--highlight)",
                  border: "2px solid var(--ink)",
                  transition: "width 0.2s ease",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={next}
            className="lp-press inline-flex items-center justify-center gap-1 rounded-lg font-display text-base px-5"
            style={{
              minHeight: 48,
              background: "var(--red)",
              color: "var(--paper2)",
              border: "3px solid var(--ink)",
              boxShadow: "3px 3px 0px var(--ink)",
            }}
          >
            {last ? "Let's go" : "Next"} <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Perforated-ticket card. The two "bites" sit on the dashed tear line; they
// are filled with the page background so they read as cut-outs, with only the
// inward-facing half of the outline drawn.
function TicketNotches({ top }) {
  const base = {
    position: "absolute",
    top,
    width: 22,
    height: 22,
    borderRadius: "50%",
    background: "var(--bg)",
    border: "4px solid transparent",
    transform: "translateY(-50%)",
    pointerEvents: "none",
  };
  return (
    <>
      <span style={{ ...base, left: -13, borderRightColor: "var(--ink)" }} />
      <span style={{ ...base, right: -13, borderLeftColor: "var(--ink)" }} />
    </>
  );
}

function ModeChooser({ onHost, onJoin, historyIndex = [], resume = null, leaving = false }) {
  const [pin, setPin] = useState("");
  const [lastRace, setLastRace] = useState(null);

  // One cheap read for the "last race" line. Failure just hides the line.
  const newestId = historyIndex[0] || null;
  useEffect(() => {
    if (!newestId) {
      setLastRace(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await window.storage.get(`race:${newestId}`, false);
        if (!cancelled && r) {
          const rec = JSON.parse(r.value);
          setLastRace({ winner: rec.winner, date: rec.date });
        }
      } catch (e) {
        // no line shown
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [newestId]);

  const lastRaceDate = lastRace?.date
    ? new Date(lastRace.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "";

  // Tap feedback, in order: haptic tick + squash; on the host ticket a stamp
  // slams on; then the stub starts tearing along the perforation (about 60%
  // of the way, sagging on its untorn hinge); then the page transition runs
  // and the flag wipe covers the half-torn ticket. Reduced motion skips
  // straight to the transition. A second tap mid-animation is ignored.
  const [stamp, setStamp] = useState(null); // null | "host" | "join"
  const [shake, setShake] = useState(false);
  const stampTimer = useRef(null);
  const shakeTimer = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(stampTimer.current);
      clearTimeout(shakeTimer.current);
    },
    []
  );
  // Host: stamp lands (0–180ms), then the stub tears. Join: tear only.
  const TEAR_DELAY = { host: 180, join: 0 };
  const [tearing, setTearing] = useState(null);
  const tearTimer = useRef(null);
  useEffect(() => () => clearTimeout(tearTimer.current), []);
  const fire = (kind, go) => {
    if (stamp) return;
    buzz(15);
    if (prefersReducedMotion()) {
      go();
      return;
    }
    setStamp(kind);
    tearTimer.current = setTimeout(() => {
      setTearing(kind);
      if (TEAR_DELAY[kind] > 0) buzz(8); // softer second tick as it rips
    }, TEAR_DELAY[kind]);
    // Hand off once the tear has mostly opened.
    stampTimer.current = setTimeout(go, TEAR_DELAY[kind] + 260);
  };

  const submitJoin = (e) => {
    e.preventDefault();
    if (pin.length < 4) {
      // Incomplete code: the slip shakes instead of tearing.
      buzz([10, 40, 10]);
      setShake(false);
      requestAnimationFrame(() => setShake(true));
      clearTimeout(shakeTimer.current);
      shakeTimer.current = setTimeout(() => setShake(false), 400);
      return;
    }
    fire("join", () => onJoin(pin));
  };

  const [hostRipples, hostPointerDown] = useRipples();
  const [joinRipples, joinPointerDown] = useRipples();

  const stampStyle = (color) => ({
    position: "absolute",
    left: "58%",
    top: "40%",
    padding: "0px 12px",
    borderRadius: 10,
    border: `4px solid ${color}`,
    color,
    background: "rgba(255,252,245,0.88)",
    pointerEvents: "none",
    whiteSpace: "nowrap",
    zIndex: 5,
  });

  return (
    // onTouchStart no-op: makes iOS Safari apply :active styles to taps.
    <div className={`max-w-md mx-auto ${leaving ? "lp-leave" : ""}`} onTouchStart={() => {}}>
      {historyIndex.length > 0 && lastRace?.winner && (
        <div
          className="lp-rise flex items-center justify-center gap-2 mb-4 mx-auto rounded-2xl px-4 py-2"
          style={{
            animationDelay: "0.6s",
            background: "var(--highlight)",
            border: "2.5px solid var(--ink)",
            boxShadow: "3px 3px 0px var(--ink)",
            width: "fit-content",
            maxWidth: "100%",
          }}
        >
          <Trophy size={16} color="var(--red)" className="shrink-0" />
          <span className="text-xs font-mono font-semibold text-center" style={{ color: "var(--ink)" }}>
            Last race: {lastRace.winner} won{lastRaceDate ? ` · ${lastRaceDate}` : ""}
            <br />
            {historyIndex.length} {historyIndex.length === 1 ? "race" : "races"} on the books
          </span>
        </div>
      )}

      {/* HOST — the main event: one person at the table runs this */}
      <button
        type="button"
        onClick={() => fire("host", onHost)}
        onPointerDown={(e) => {
          pressHandlers.onPointerDown(e);
          hostPointerDown(e);
        }}
        onPointerUp={pressHandlers.onPointerUp}
        onPointerCancel={pressHandlers.onPointerCancel}
        onPointerMove={tiltHandlers.onPointerMove}
        onPointerLeave={tiltHandlers.onPointerLeave}
        className={`lp-rise lp-ticket lp-host-ticket relative block w-full text-left rounded-2xl mb-5 ${
          stamp === "host" ? "lp-squash" : ""
        } ${tearing === "host" ? "lp-tearing" : ""}`}
        style={{ animationDelay: "0.7s", background: "transparent", border: "none", padding: 0 }}
      >
        {/* Clip layer for the shine sweep and click ripples */}
        <span
          aria-hidden="true"
          className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none"
          style={{ zIndex: 3 }}
        >
          <span className="lp-shine" />
          {hostRipples}
        </span>
        {stamp === "host" && (
          <span className="lp-stamp font-display text-2xl" style={stampStyle("var(--red)")} aria-hidden="true">
            {resume ? "Welcome back!" : "Let's race!"}
          </span>
        )}
        <div
          className="lp-piece rounded-t-2xl"
          style={{ background: "var(--paper2)", border: "4px solid var(--ink)", borderBottom: "none" }}
        >
        <div
          className="rounded-t-xl px-4 py-1.5 flex items-center justify-between"
          style={{ background: "var(--yellow)", borderBottom: "4px solid var(--ink)" }}
        >
          <span className="font-mono text-xs font-semibold tracking-widest uppercase" style={{ color: "var(--ink)" }}>
            {resume ? "Welcome back · Host" : "Admit one · Host"}
          </span>
          <span className="font-mono text-xs font-semibold" style={{ color: "var(--ink)" }}>
            No. 001
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 pt-4 pb-5">
          <span
            className="lp-emoji flex items-center justify-center shrink-0 rounded-full text-3xl"
            style={{ width: 56, height: 56, background: "var(--highlight)", border: "3px solid var(--ink)" }}
          >
            🎪
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl leading-tight" style={{ color: "var(--ink)" }}>
              {resume ? "Continue your game" : "Host a game"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {resume
                ? `${[resume.race, resume.status].filter(Boolean).join(" · ")} — pick up where you left off.`
                : "Set up racers, run the track, and open the book for betting."}
            </p>
          </div>
        </div>
        </div>
        <div
          className={`lp-piece relative rounded-b-2xl flex items-center justify-between px-4 py-3 ${
            tearing === "host" ? "lp-stub-tear" : ""
          }`}
          style={{
            background: "var(--paper2)",
            border: "4px solid var(--ink)",
            borderTop: "3px dashed var(--ink)",
          }}
        >
          <TicketNotches top={-2} />
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            {resume ? "Your game is saved" : "You run the race"}
          </span>
          <span
            className="lp-cta inline-flex items-center justify-center gap-1.5 rounded-lg font-display text-base px-4"
            style={{
              minHeight: 48,
              background: "var(--red)",
              color: "var(--paper2)",
              border: "3px solid var(--ink)",
              boxShadow: "3px 3px 0px var(--ink)",
            }}
          >
            <Play size={16} /> {resume ? "Resume" : "Let's race"}
          </span>
        </div>
      </button>

      {/* JOIN — betting slip with the code field right on it */}
      <form
        onSubmit={submitJoin}
        className={`lp-rise lp-slip relative rounded-2xl ${stamp === "join" ? "lp-squash" : ""} ${
          shake ? "lp-shake" : ""
        } ${tearing === "join" ? "lp-tearing" : ""}`}
        style={{ animationDelay: "0.85s" }}
      >
        <div
          className="lp-piece rounded-t-2xl"
          style={{ background: "var(--paper2)", border: "4px solid var(--ink)", borderBottom: "none" }}
        >
        <div
          className="rounded-t-xl px-4 py-1.5 flex items-center justify-between"
          style={{ background: "var(--purple)", borderBottom: "4px solid var(--ink)" }}
        >
          <span className="font-mono text-xs font-semibold tracking-widest uppercase" style={{ color: "#FFFCF5" }}>
            Betting slip · Spectator
          </span>
        </div>
        <div className="flex items-center gap-3 px-4 pt-4 pb-4">
          <span
            className="lp-emoji flex items-center justify-center shrink-0 rounded-full text-3xl"
            style={{ width: 56, height: 56, background: "var(--highlight)", border: "3px solid var(--ink)" }}
          >
            🎟️
          </span>
          <div className="min-w-0">
            <p className="font-display text-2xl leading-tight" style={{ color: "var(--ink)" }}>
              Join with a code
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              Enter the host's 4-digit code to bet from your own phone.
            </p>
          </div>
        </div>
        </div>
        <div
          className={`lp-piece relative rounded-b-2xl flex items-stretch gap-2 px-4 py-3 ${
            tearing === "join" ? "lp-stub-tear" : ""
          }`}
          style={{
            background: "var(--paper2)",
            border: "4px solid var(--ink)",
            borderTop: "3px dashed var(--ink)",
          }}
        >
          <TicketNotches top={-2} />
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            aria-label="4-digit join code"
            placeholder="0000"
            className="lp-code-input flex-1 min-w-0 text-center font-mono text-2xl font-semibold rounded-lg"
            style={{
              minHeight: 48,
              letterSpacing: "0.3em",
              color: "var(--ink)",
              background: "var(--paper)",
              border: "3px solid var(--ink)",
            }}
          />
          <button
            type="submit"
            onPointerDown={joinPointerDown}
            className="lp-press relative overflow-hidden shrink-0 inline-flex items-center justify-center gap-1 rounded-lg font-display text-base px-5"
            style={{
              minHeight: 48,
              background: "var(--purple)",
              color: "#FFFCF5",
              border: "3px solid var(--ink)",
              boxShadow: "3px 3px 0px var(--ink)",
            }}
          >
            <span aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none">
              {joinRipples}
            </span>
            Join <ChevronRight size={16} className="lp-chev" />
          </button>
        </div>
      </form>

      <p
        className="lp-rise text-center text-xs mt-5"
        style={{ color: "var(--onBg)", animationDelay: "1s" }}
      >
        Everyone opens this same link — one person hosts, everyone else joins.
      </p>
    </div>
  );
}

function SpectatorView({ onLeave, initialPin = "" }) {
  const { seen: onboardingSeen, dismiss: dismissOnboarding } = useOnboarding();
  const [joined, setJoined] = useState(false);
  const [pinInput, setPinInput] = useState(initialPin);
  const [nameInput, setNameInput] = useState("");
  const [joinError, setJoinError] = useState("");
  const [token, setToken] = useState(null);
  const [spectatorName, setSpectatorName] = useState("");
  const [snapshot, setSnapshot] = useState(null);
  const [sessionActive, setSessionActive] = useState(true);
  const [myBets, setMyBets] = useState([]);
  const lastRaceIdRef = useRef(null);

  const [betRacer, setBetRacer] = useState("");
  const [betAmount, setBetAmount] = useState("");
  const [betType, setBetType] = useState("win"); // "win" | "place"

  const join = async () => {
    setJoinError("");
    const pin = pinInput.trim();
    const name = nameInput.trim();
    if (!/^\d{4}$/.test(pin)) {
      setJoinError("Enter the 4-digit code.");
      return;
    }
    if (!name) {
      setJoinError("Enter your name.");
      return;
    }
    try {
      const res = await window.storage.get("session-pin", true);
      if (!res) {
        setJoinError("No game is being hosted right now.");
        return;
      }
      const s = JSON.parse(res.value);
      if (!s.active || s.pin !== pin) {
        setJoinError("That code didn't match — double-check with the host.");
        return;
      }
      setToken(s.token);
      setSpectatorName(name);
      setJoined(true);
    } catch (e) {
      setJoinError("Couldn't reach the game. Try again.");
    }
  };

  useEffect(() => {
    if (!joined || !token) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await window.storage.get(`race:${token}`, true);
        if (!cancelled && res) {
          const snap = JSON.parse(res.value);
          if (lastRaceIdRef.current && snap.raceId !== lastRaceIdRef.current) {
            setMyBets([]);
            setBetRacer("");
            setBetAmount("");
          }
          lastRaceIdRef.current = snap.raceId;
          setSnapshot(snap);
        }
      } catch (e) {
        // try again next tick
      }
      try {
        const s = await window.storage.get("session-pin", true);
        if (!cancelled && s) {
          const parsed = JSON.parse(s.value);
          setSessionActive(!!parsed.active && parsed.token === token);
        }
      } catch (e) {
        // try again next tick
      }
    };
    poll();
    const interval = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [joined, token]);

  const placeBet = async () => {
    const amt = parseFloat(betAmount);
    if (!betRacer || !amt || amt <= 0 || !snapshot || !snapshot.odds[betRacer]) return;
    const bet = { id: uid(), bettorName: spectatorName, racerId: betRacer, amount: amt, betType };
    setMyBets((prev) => [...prev, bet]);
    setBetAmount("");
    try {
      await window.storage.set(`bet:${token}:${snapshot.raceId}:${bet.id}`, JSON.stringify(bet), true);
    } catch (e) {
      // best effort
    }
  };

  if (!joined) {
    return (
      <Card>
        <SectionTitle icon={Coins}>Join as a spectator</SectionTitle>
        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          Get the 4-digit code from whoever's hosting.
        </p>
        <input
          value={nameInput}
          onChange={(e) => setNameInput(e.target.value)}
          placeholder="Your name"
          className="w-full mb-2 px-3 py-2 rounded-lg border text-sm"
          style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
        />
        <input
          value={pinInput}
          onChange={(e) => setPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(e) => e.key === "Enter" && join()}
          placeholder="4-digit code"
          inputMode="numeric"
          className="w-full mb-2 px-3 py-2 rounded-lg border text-sm font-mono text-center text-lg tracking-widest"
          style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
        />
        {joinError && (
          <p className="text-xs mb-2" style={{ color: "var(--red)" }}>
            {joinError}
          </p>
        )}
        <button
          onClick={join}
          className="w-full py-3 rounded-lg text-sm font-bold mb-2"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          Join
        </button>
        <button onClick={onLeave} className="w-full py-2 text-xs" style={{ color: "var(--muted)" }}>
          ← Back
        </button>
      </Card>
    );
  }

  if (!snapshot) {
    return (
      <Card>
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          Connecting to the race…
        </p>
      </Card>
    );
  }

  const snapRacers = Array.isArray(snapshot.racers) ? snapshot.racers : [];
  const snapOdds = snapshot.odds || {};
  const sortedRacers = [...snapRacers].sort((a, b) => b.position - a.position);
  const bettingOpen = snapshot.status === "setup" && sessionActive;
  const winnerId = snapshot.finishOrder && snapshot.finishOrder[0];
  const runnerUpId = snapshot.finishOrder && snapshot.finishOrder[1];
  const myStaked = myBets.reduce((s, b) => s + b.amount, 0);
  const myPayout =
    snapshot.status === "finished"
      ? myBets.reduce((s, b) => {
          const isWin = (b.betType || "win") === "win";
          const hitWin = isWin && b.racerId === winnerId;
          const hitPlace = !isWin && (b.racerId === winnerId || b.racerId === runnerUpId);
          if (!hitWin && !hitPlace) return s;
          const racerWinOdds = snapOdds[b.racerId] || 0;
          const payoutOdds = isWin ? racerWinOdds : placeOddsFor(racerWinOdds);
          return s + b.amount * payoutOdds;
        }, 0)
      : 0;

  return (
    <div>
      <OnboardingBanner id="spectatorJoin" seen={onboardingSeen} dismiss={dismissOnboarding}>
        You're in! Odds and standings update automatically every few seconds — no need to refresh.
        Place bets below whenever they're open.
      </OnboardingBanner>

      <Card>
        <div className="flex items-center justify-between">
          <p className="font-display font-bold text-lg" style={{ color: "var(--ink)" }}>
            Hey, {spectatorName}
          </p>
          <button onClick={onLeave} className="text-xs" style={{ color: "var(--muted)" }}>
            Leave
          </button>
        </div>
        <p className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          {!sessionActive
            ? "Host closed betting"
            : snapshot.status === "setup"
            ? "Betting open"
            : snapshot.status === "racing"
            ? "Race in progress"
            : "Race finished"}
        </p>
      </Card>

      <Card>
        <SectionTitle icon={Flag}>Who's winning</SectionTitle>
        <div className="space-y-1.5">
          {sortedRacers.map((r, i) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span className="font-mono text-xs w-4 text-center" style={{ color: "var(--red)" }}>
                {i + 1}
              </span>
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: r.color }} />
              <span className="flex-1 truncate">{r.name}</span>
              {r.finished && (
                <span
                  className="font-mono text-xs px-1.5 py-0.5 rounded"
                  style={{ background: "var(--yellow)", color: "var(--ink)" }}
                >
                  {winnerId === r.id ? "1st" : "2nd"}
                </span>
              )}
              <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                {r.position}/{snapshot.trackLength}
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle icon={Coins}>Odds</SectionTitle>
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
            Racer
          </span>
          <div className="flex gap-3">
            <span className="font-mono text-xs w-14 text-right" style={{ color: "var(--muted)" }}>
              Win
            </span>
            <span className="font-mono text-xs w-14 text-right" style={{ color: "var(--muted)" }}>
              Place
            </span>
          </div>
        </div>
        <div className="space-y-1.5">
          {snapRacers.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between text-sm px-2 py-1.5 rounded"
              style={{ background: "var(--paper)" }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full inline-block shrink-0" style={{ background: r.color }} />
                <span className="truncate">{r.name}</span>
              </span>
              <div className="flex gap-3 shrink-0">
                <span className="font-mono text-sm font-semibold w-14 text-right" style={{ color: "var(--red)" }}>
                  {snapOdds[r.id] ? `×${snapOdds[r.id].toFixed(2)}` : "—"}
                </span>
                <span className="font-mono text-sm w-14 text-right" style={{ color: "var(--muted)" }}>
                  {snapOdds[r.id] ? `×${placeOddsFor(snapOdds[r.id]).toFixed(2)}` : "—"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {bettingOpen && Object.keys(snapOdds).length > 0 && (
        <Card>
          <SectionTitle icon={Plus}>Place a bet</SectionTitle>
          <OnboardingBanner id="betType" seen={onboardingSeen} dismiss={dismissOnboarding}>
            Win only pays if your racer finishes 1st. Place pays if they finish 1st or 2nd, at a
            lower rate.
          </OnboardingBanner>
          <p className="text-xs font-mono uppercase mb-1.5" style={{ color: "var(--muted)" }}>
            Win or place?
          </p>
          <div className="flex gap-1.5 mb-3">
            {[
              ["win", "Win (1st only)"],
              ["place", "Place (top 2)"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBetType(id)}
                className="flex-1 px-3 py-2 rounded-full text-sm font-medium border-2"
                style={{
                  background: betType === id ? "var(--purple)" : "var(--paper)",
                  color: betType === id ? "var(--paper2)" : "var(--ink)",
                  borderColor: betType === id ? "var(--purple)" : "var(--ink)",
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {snapRacers.map((r) => {
              const hasOdds = !!snapOdds[r.id];
              const shownOdds = hasOdds ? (betType === "win" ? snapOdds[r.id] : placeOddsFor(snapOdds[r.id])) : null;
              return (
                <button
                  key={r.id}
                  onClick={() => hasOdds && setBetRacer(r.id)}
                  disabled={!hasOdds}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border-2 disabled:opacity-40"
                  style={{
                    background: betRacer === r.id ? "var(--green)" : "var(--paper)",
                    color: betRacer === r.id ? "var(--paper2)" : "var(--ink)",
                    borderColor: betRacer === r.id ? "var(--green)" : "var(--ink)",
                  }}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: r.color }} />
                  {r.name}
                  <span className="font-mono text-xs opacity-80">
                    {shownOdds ? `×${shownOdds.toFixed(2)}` : "posting…"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[5, 10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setBetAmount(String(n))}
                className="px-3 py-2 rounded-lg text-sm font-mono font-semibold border-2"
                style={{
                  background: betAmount === String(n) ? "var(--yellow)" : "var(--paper)",
                  borderColor: betAmount === String(n) ? "var(--yellow)" : "var(--ink)",
                  color: "var(--ink)",
                }}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min="0"
              step="0.5"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="custom"
              className="flex-1 px-2 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--ink)", background: "var(--paper)", minWidth: 80 }}
            />
          </div>
          <button
            onClick={placeBet}
            disabled={!betRacer || !betAmount}
            className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            Place bet
          </button>
        </Card>
      )}

      {myBets.length > 0 && (
        <Card>
          <SectionTitle icon={Clock}>Your bets</SectionTitle>
          <div className="space-y-1">
            {myBets.map((b) => {
              const racer = snapRacers.find((r) => r.id === b.racerId);
              const isWin = (b.betType || "win") === "win";
              const racerWinOdds = snapOdds[b.racerId] || 0;
              const applicableOdds = isWin ? racerWinOdds : placeOddsFor(racerWinOdds);
              return (
                <div key={b.id} className="flex items-center justify-between text-xs px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    {racer?.name}
                    <span
                      className="font-mono px-1 rounded"
                      style={{
                        background: isWin ? "var(--highlight)" : "var(--paper2)",
                        border: "1px solid var(--ink)",
                        fontSize: "10px",
                      }}
                    >
                      {isWin ? "WIN" : "PLACE"}
                    </span>
                  </span>
                  <span className="font-mono">
                    {b.amount.toFixed(2)} @ ×{applicableOdds.toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          {snapshot.status === "finished" && (
            <div className="mt-2 pt-2" style={{ borderTop: "1.5px solid var(--ink)" }}>
              <p
                className="font-mono text-sm font-semibold"
                style={{ color: myPayout - myStaked >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {myPayout - myStaked >= 0 ? "+" : ""}
                {(myPayout - myStaked).toFixed(2)} net
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ConfirmButton({ onConfirm, armedLabel, className, style, children }) {
  const [armed, setArmed] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const handleClick = () => {
    if (armed) {
      clearTimeout(timerRef.current);
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      timerRef.current = setTimeout(() => setArmed(false), 3000);
    }
  };

  return (
    <button onClick={handleClick} className={className} style={style}>
      {armed ? armedLabel : children}
    </button>
  );
}

function TabBar({ tab, setTab, status }) {
  const tabs = [
    { id: "setup", label: "Racers", icon: Users },
    { id: "betting", label: "Betting", icon: Coins },
    { id: "track", label: "Track", icon: Flag },
    { id: "dice", label: "Dice", icon: Dices },
    { id: "history", label: "History", icon: Clock },
  ];
  const racing = status === "racing";
  return (
    <div
      className="flex rounded-lg overflow-hidden mb-6 border-4"
      style={{ borderColor: "var(--ink)" }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        const lockedOut = racing && t.id !== "track" && t.id !== "dice";
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            onClick={() => !lockedOut && setTab(t.id)}
            disabled={lockedOut}
            className="flex-1 flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors disabled:opacity-30"
            style={{
              background: active ? "var(--yellow)" : "transparent",
              color: active ? "var(--ink)" : "var(--onBgMuted)",
            }}
          >
            <Icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl border-4 p-4 mb-4 ${className}`}
      style={{
        background: "var(--paper2)",
        borderColor: "var(--ink)",
        boxShadow: "5px 5px 0px var(--ink)",
      }}
    >
      {children}
    </div>
  );
}

function SectionTitle({ children, icon: Icon }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon size={16} color="var(--red)" />}
      <h2 className="font-display font-bold text-lg" style={{ color: "var(--ink)" }}>
        {children}
      </h2>
    </div>
  );
}

const CONFETTI_COLORS = [
  "var(--yellow)",
  "var(--red)",
  "var(--green)",
  "var(--purple)",
  "#4F8FD1",
  "#E8639A",
];

function Confetti() {
  const [pieces] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      size: 5 + Math.random() * 5,
    }))
  );
  return (
    <div className="relative h-0 overflow-visible pointer-events-none" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti-piece absolute top-0 rounded-sm"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

// Draft variant definitions. Each variant is drafted in one or more "waves":
// a wave is a fresh face-up card line plus the snake pick-order for that line.
// `waves(n)` returns an array of waves: { cards, order } where order is an
// array of 0-based player indices (the pick sequence for that line).
const DRAFT_VARIANTS = {
  standard: {
    label: "Standard (3–6 players)",
    minPlayers: 3,
    maxPlayers: 6,
    teamSize: 4,
    // Two snake drafts, each from its own line of 2× players cards. The second
    // draft starts one seat to the left (rulebook: "repeat, starting with the
    // player to the left of the start player").
    waves: (n) => {
      const fwd = Array.from({ length: n }, (_, i) => i);
      const rev = [...fwd].reverse();
      const snake1 = [...fwd, ...rev];
      const snake2 = snake1.map((i) => (i + 1) % n);
      return [
        { cards: n * 2, order: snake1 },
        { cards: n * 2, order: snake2 },
      ];
    },
  },
  two_player: {
    label: "2-player variant",
    minPlayers: 2,
    maxPlayers: 2,
    teamSize: 8,
    // Two lines of 8, each drafted ABBAABBA (4 each per line) → 8 each.
    waves: () => {
      const abbaabba = [0, 1, 1, 0, 0, 1, 1, 0];
      return [
        { cards: 8, order: abbaabba },
        { cards: 8, order: abbaabba },
      ];
    },
  },
  three_double: {
    label: "3-player double-racer",
    minPlayers: 3,
    maxPlayers: 3,
    teamSize: 8,
    // Four lines of 6, each drafted as a single snake (ABC CBA = 2 each),
    // rotating who drafts first each round → 8 each.
    waves: () => {
      const n = 3;
      return Array.from({ length: 4 }, (_, round) => {
        const fwd = Array.from({ length: n }, (_, i) => (i + round) % n);
        const rev = [...fwd].reverse();
        return { cards: 6, order: [...fwd, ...rev] };
      });
    },
  },
};


// ---------------------------------------------------------------------------
// Racer name entry: fast, thumb-friendly search over the official 36.
// Matching ignores case, spaces and punctuation ("mouth" finds M.O.U.T.H.),
// ranks "starts with" above "contains", and offers "Did you mean…?" for typos.
// ---------------------------------------------------------------------------
const normName = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
const NO_EXCLUDE = new Set();

function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// exclude: Set of normalized names to leave out of the suggestions.
function suggestRacers(query, exclude = NO_EXCLUDE, limit = 4) {
  const q = normName(query);
  if (!q) return { matches: [], didYouMean: null, exact: null };
  const pool = RACER_NAMES.filter((n) => !exclude.has(normName(n)));
  const exact = pool.find((n) => normName(n) === q) || null;
  const starts = pool.filter((n) => normName(n).startsWith(q));
  const has = pool.filter((n) => !starts.includes(n) && normName(n).includes(q));
  const matches = [...starts, ...has].slice(0, limit);
  let didYouMean = null;
  if (!matches.length && q.length >= 3) {
    let bestD = 3;
    pool.forEach((n) => {
      const d = editDistance(q, normName(n));
      if (d < bestD) {
        bestD = d;
        didYouMean = n;
      }
    });
  }
  return { matches, didYouMean, exact };
}

function RacerNameField({
  value,
  onChange,
  onAccept,
  exclude,
  placeholder,
  disabled,
  className,
  style,
  inputRef,
  ariaLabel,
  enterKeyHint = "next",
}) {
  const [focused, setFocused] = useState(false);
  const q = (value || "").trim();
  const { matches, didYouMean, exact } = suggestRacers(q, exclude || NO_EXCLUDE);
  const showChips = focused && !!q && !exact && !disabled;
  const pick = (name) => {
    onChange(name);
    if (onAccept) onAccept(name);
  };
  const chipStyle = {
    background: "var(--paper2)",
    border: "2px solid var(--ink)",
    color: "var(--ink)",
    minHeight: 48,
  };
  return (
    <div>
      <input
        ref={inputRef}
        value={value || ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // Tidy typed names: "banana" -> "Banana", "mouth" -> "M.O.U.T.H."
          const hit = RACER_NAMES.find((n) => normName(n) === normName(value));
          if (hit && hit !== value) onChange(hit);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          if (matches[0]) pick(matches[0]);
          else if (q && onAccept) onAccept(q);
        }}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        className={className}
        style={style}
      />
      {showChips && (
        <div className="flex flex-wrap gap-1.5 mt-1.5" role="listbox" aria-label="Racer suggestions">
          {matches.map((n) => (
            <button
              key={n}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(n)}
              className="px-4 rounded-full text-sm font-bold"
              style={chipStyle}
            >
              {n}
            </button>
          ))}
          {!matches.length && didYouMean && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(didYouMean)}
              className="px-4 rounded-full text-sm font-bold"
              style={{ ...chipStyle, background: "var(--highlight)" }}
            >
              Did you mean {didYouMean}?
            </button>
          )}
          {!matches.length && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onAccept && onAccept(q)}
              className="px-4 rounded-full text-sm font-medium"
              style={{ ...chipStyle, borderStyle: "dashed", color: "var(--muted)" }}
            >
              Use “{q}” as a custom racer
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Bottom sheet with every racer as a big tap target. Tap to add to the next
// free card slot, tap again to take it off the line.
function RacerBrowseSheet({ open, onClose, values, count, onToggle, blocked, tagFor }) {
  const [search, setSearch] = useState("");
  if (!open) return null;
  const q = normName(search);
  const chosen = new Set(values.map((v) => normName(v)).filter(Boolean));
  const filled = chosen.size;
  const list = RACER_NAMES.filter((n) => !q || normName(n).includes(q));
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.45)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Pick racers from the full list"
    >
      <div
        className="w-full max-w-xl rounded-t-2xl p-3 flex flex-col"
        style={{
          background: "var(--paper2)",
          border: "3px solid var(--ink)",
          borderBottom: "none",
          maxHeight: "82vh",
          paddingBottom: "max(12px, env(safe-area-inset-bottom, 0px))",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <p className="font-display font-bold text-lg" style={{ color: "var(--ink)" }}>
            Pick racers
          </p>
          <span className="font-mono font-semibold text-sm" style={{ color: "var(--red)" }}>
            {filled} of {count}
          </span>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search racers"
          aria-label="Search racers"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-3 py-2 rounded-lg border text-sm mb-2"
          style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
        />
        <div className="overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 flex-1" style={{ minHeight: 0 }}>
          {list.map((n) => {
            const on = chosen.has(normName(n));
            const isBlocked = blocked.has(normName(n));
            const full = !on && filled >= count;
            const tag = tagFor ? tagFor(n) : null;
            return (
              <button
                key={n}
                type="button"
                disabled={isBlocked || full}
                onClick={() => onToggle(n)}
                aria-pressed={on}
                className="px-2 rounded-lg text-sm font-bold text-left disabled:opacity-35"
                style={{
                  minHeight: 48,
                  background: on ? "var(--green)" : "var(--paper)",
                  color: on ? "var(--paper2)" : "var(--ink)",
                  border: "2px solid var(--ink)",
                }}
              >
                <span className="block leading-tight">{on ? "✓ " : ""}{n}</span>
                {isBlocked ? (
                  <span className="block font-mono text-[10px] font-medium">drafted already</span>
                ) : tag ? (
                  <span className="block font-mono text-[10px] font-medium opacity-75">{tag}</span>
                ) : null}
              </button>
            );
          })}
          {!list.length && (
            <p className="col-span-full text-xs py-3 text-center" style={{ color: "var(--muted)" }}>
              No racer matches “{search}”. Close this and type it in to add a custom racer.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full mt-2 py-3 rounded-lg text-sm font-bold"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          {filled >= count ? "Done — all cards filled" : `Done (${count - filled} to go)`}
        </button>
      </div>
    </div>
  );
}

function DraftAssistant({ onApply, onCancel, onboardingSeen, dismissOnboarding, usedRacers = {} }) {
  const [phase, setPhase] = useState("config"); // config | rolloff | enter_cards | picking | done
  const [variantId, setVariantId] = useState("standard");
  const [playerCount, setPlayerCount] = useState(4);
  const [playerNames, setPlayerNames] = useState(["", "", "", ""]);
  // Race count is a house-rule shortening of the official 4-race game —
  // only meaningful for the standard variant, the only one with session
  // tracking (the champion screen, the race counter).
  const [raceCount, setRaceCount] = useState(4);

  const variant = DRAFT_VARIANTS[variantId];

  // roll-off
  const [rolls, setRolls] = useState({}); // seatIndex -> die value
  const [rollingFaces, setRollingFaces] = useState({}); // seatIndex -> cosmetic face shown mid-shake
  const rollTimers = useRef({}); // seatIndex -> pending animation timeout
  const [rollMode, setRollMode] = useState("app"); // "app" (in-app dice) | "physical" (enter real rolls)
  const [seatOrder, setSeatOrder] = useState([]); // resolved order: array of seat indices, best first
  const [tieGroup, setTieGroup] = useState(null); // seat indices still tied

  // card line
  const [cardInputs, setCardInputs] = useState([]);

  // picking
  const [picks, setPicks] = useState([]); // parallel to current wave's order: racer name or null
  const [pickIndex, setPickIndex] = useState(0);

  // waves: which card-line we're on, and racers banked from completed waves
  const [waveIndex, setWaveIndex] = useState(0);
  const [bankedTeams, setBankedTeams] = useState(null); // seat -> [racer names] from finished waves

  const setCount = (n) => {
    setPlayerCount(n);
    setPlayerNames((prev) => {
      const next = [...prev];
      next.length = n;
      for (let i = 0; i < n; i++) if (!next[i]) next[i] = "";
      return next;
    });
  };

  const chooseVariant = (id) => {
    setVariantId(id);
    const v = DRAFT_VARIANTS[id];
    setCount(v.minPlayers === v.maxPlayers ? v.minPlayers : Math.max(v.minPlayers, 3));
  };

  const labelFor = (seatIdx) => playerNames[seatIdx]?.trim() || `Player ${seatIdx + 1}`;

  const resolvedLabels = Array.from({ length: playerCount }, (_, i) => labelFor(i).toLowerCase());
  const hasDuplicateLabels = new Set(resolvedLabels).size !== resolvedLabels.length;

  // ---- roll-off ----
  const clearRollTimers = () => {
    Object.values(rollTimers.current).forEach(clearTimeout);
    rollTimers.current = {};
    setRollingFaces({});
  };

  // Stop any in-flight shake if the assistant closes mid-roll.
  useEffect(
    () => () => {
      Object.values(rollTimers.current).forEach(clearTimeout);
    },
    []
  );

  const startRolloff = () => {
    clearRollTimers();
    setRolls({});
    setSeatOrder([]);
    setTieGroup(null);
    setPhase("rolloff");
  };

  const switchRollMode = (m) => {
    if (m === rollMode) return;
    clearRollTimers();
    setRollMode(m);
    setRolls({});
    setTieGroup(null);
  };

  const ROLL_ANIM_MS = 1100;

  const rollFor = (seatIdx) => {
    if (rolls[seatIdx] != null || rollTimers.current[seatIdx]) return;
    // The fair result is drawn once, up front, from the same unbiased
    // rollSingleDie() as before. Everything shown during the shake is
    // cosmetic; the real value is only revealed (and counted) on landing.
    const result = rollSingleDie();
    if (prefersReducedMotion()) {
      setRolls((prev) => ({ ...prev, [seatIdx]: result }));
      return;
    }
    const start = Date.now();
    let delay = 55;
    let lastFace = 0;
    const step = () => {
      if (Date.now() - start >= ROLL_ANIM_MS) {
        delete rollTimers.current[seatIdx];
        setRollingFaces((prev) => {
          const next = { ...prev };
          delete next[seatIdx];
          return next;
        });
        setRolls((prev) => ({ ...prev, [seatIdx]: result }));
        return;
      }
      let face;
      do {
        face = 1 + Math.floor(Math.random() * 6);
      } while (face === lastFace);
      lastFace = face;
      setRollingFaces((prev) => ({ ...prev, [seatIdx]: face }));
      // Faces flicker fast, then slow down as the die "settles".
      delay = Math.min(delay * 1.1, 190);
      rollTimers.current[seatIdx] = setTimeout(step, delay);
    };
    step();
  };

  const setManualRoll = (seatIdx, raw) => {
    if (raw === "") {
      setRolls((prev) => {
        const next = { ...prev };
        delete next[seatIdx];
        return next;
      });
      return;
    }
    const v = parseInt(raw, 10);
    if (Number.isNaN(v) || v < 1 || v > 6) return;
    setRolls((prev) => ({ ...prev, [seatIdx]: v }));
  };

  const contenders = tieGroup || Array.from({ length: playerCount }, (_, i) => i);
  const allRolled = contenders.every((s) => rolls[s] != null);
  // Highest roll once everyone has landed — highlighted so the winner is obvious.
  const topRoll = allRolled ? Math.max(...contenders.map((s) => rolls[s])) : null;
  const topCount = topRoll != null ? contenders.filter((s) => rolls[s] === topRoll).length : 0;

  const waves = variant.waves(playerCount);
  const totalWaves = waves.length;
  const currentWave = waves[waveIndex] || waves[0];
  const snakeSeq = currentWave.order;

  const resolveRolloff = () => {
    // Sort all seats by roll desc; detect ties at the top that need a reroll.
    const sorted = [...Array(playerCount).keys()].sort((a, b) => (rolls[b] || 0) - (rolls[a] || 0));
    const values = contenders.map((s) => rolls[s]);
    const maxVal = Math.max(...values);
    const topTied = contenders.filter((s) => rolls[s] === maxVal);
    if (topTied.length > 1) {
      // Re-roll just the tied group; keep everyone else's positions implied by their rolls.
      setTieGroup(topTied);
      setRolls((prev) => {
        const next = { ...prev };
        topTied.forEach((s) => delete next[s]);
        return next;
      });
      return;
    }
    setSeatOrder(sorted);
    setBankedTeams(Array.from({ length: playerCount }, () => []));
    setWaveIndex(0);
    setPhase("enter_cards");
  };

  // ---- card line (per wave) ----
  const cardCount = currentWave.cards;
  useEffect(() => {
    setCardInputs((prev) => {
      const next = [...prev];
      next.length = cardCount;
      for (let i = 0; i < cardCount; i++) if (next[i] == null) next[i] = "";
      return next;
    });
  }, [cardCount, waveIndex]);

  // Racers already banked from earlier waves can't be flipped/drafted again.
  const bankedNames = new Set(
    (bankedTeams || []).flat().map((n) => n.toLowerCase())
  );
  const cardsValid =
    cardInputs.filter((c) => c.trim()).length === cardCount &&
    new Set(cardInputs.map((c) => c.trim().toLowerCase())).size === cardCount &&
    !cardInputs.some((c) => bankedNames.has(c.trim().toLowerCase()));

  const cardRefs = useRef([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const bankedNorm = new Set([...bankedNames].map(normName));
  // Earlier races' racers, shown as a small tag in the full list.
  const usedTag = (name) => {
    const hits = [];
    Object.values(usedRacers || {}).forEach((list) =>
      (list || []).forEach((u) => {
        if (normName(u.name) === normName(name)) hits.push(u.race);
      })
    );
    return hits.length ? `used in race ${[...new Set(hits)].join(", ")}` : null;
  };
  // After a name is accepted, jump to the next empty card (or close the keyboard).
  const focusNextCard = (i) => {
    const order = [...cardInputs.keys()].filter((j) => j !== i);
    const next = order.find((j) => j > i && !(cardInputs[j] || "").trim()) ?? order.find((j) => !(cardInputs[j] || "").trim());
    setTimeout(() => {
      if (next != null && cardRefs.current[next]) cardRefs.current[next].focus();
      else if (cardRefs.current[i]) cardRefs.current[i].blur();
    }, 0);
  };
  const setCard = (i, v) =>
    setCardInputs((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
  const toggleBrowse = (name) => {
    const at = cardInputs.findIndex((c) => normName(c) === normName(name));
    if (at >= 0) return setCard(at, "");
    const free = cardInputs.findIndex((c, j) => j < cardCount && !(c || "").trim());
    if (free >= 0) setCard(free, name);
  };

  const beginPicking = () => {
    setPicks(new Array(snakeSeq.length).fill(null));
    setPickIndex(0);
    setPhase("picking");
  };

  // ---- picking ----
  const pickedNames = new Set(picks.filter(Boolean).map((n) => n.toLowerCase()));
  const availableCards = cardInputs
    .map((c) => c.trim())
    .filter((c) => c && !pickedNames.has(c.toLowerCase()));

  // Bank a completed wave's picks into per-seat teams. Takes the picks array
  // explicitly — the final pick of a wave isn't in `picks` state yet when this
  // runs (setState is async), so the caller passes the up-to-date array.
  const bankWave = (wavePicks) => {
    setBankedTeams((prev) => {
      const base = prev || Array.from({ length: playerCount }, () => []);
      const next = base.map((arr) => [...arr]);
      snakeSeq.forEach((seat, i) => {
        if (wavePicks[i]) next[seat].push(wavePicks[i]);
      });
      return next;
    });
  };

  const makePick = (name) => {
    const updated = [...picks];
    updated[pickIndex] = name;
    setPicks(updated);
    const nextIdx = pickIndex + 1;
    if (nextIdx >= snakeSeq.length) {
      // Wave complete — bank it (from `updated`, which includes this final
      // pick), then move to the next wave or finish.
      bankWave(updated);
      if (waveIndex + 1 < totalWaves) {
        setWaveIndex((w) => w + 1);
        setCardInputs([]);
        setPicks([]);
        setPickIndex(0);
        setTimeout(() => setPhase("enter_cards"), 0);
      } else {
        setTimeout(() => setPhase("done"), 0);
      }
    } else {
      setPickIndex(nextIdx);
    }
  };

  const undoPick = () => {
    if (pickIndex === 0) return;
    const prevIdx = pickIndex - 1;
    setPicks((prev) => {
      const next = [...prev];
      next[prevIdx] = null;
      return next;
    });
    setPickIndex(prevIdx);
  };

  // Rewind to a specific earlier pick within the current wave: clear that slot
  // and every pick after it, then hand the turn back to that slot.
  const undoPickAt = (slotIndex) => {
    setPicks((prev) => prev.map((p, i) => (i >= slotIndex ? null : p)));
    setPickIndex(slotIndex);
  };

  // Final teams = everything banked from completed waves (the current wave is
  // already banked by the time we reach "done").
  const buildTeams = () => {
    const banked = bankedTeams || Array.from({ length: playerCount }, () => []);
    return Array.from({ length: playerCount }, (_, seat) => ({
      player: labelFor(seat),
      racers: banked[seat] || [],
    }));
  };

  // ===================== RENDER =====================
  // Plain helper (NOT a component) — defining a component inside this render
  // would give it a new identity every keystroke and remount its inputs,
  // dropping focus after one character. Calling it as a function avoids that.
  const wrap = (children) => (
    <div>
      <Card>
        <div className="flex items-center justify-between">
          <SectionTitle icon={Dices}>Draft</SectionTitle>
          <button onClick={onCancel} className="text-xs" style={{ color: "var(--muted)" }}>
            Cancel
          </button>
        </div>
        {children}
      </Card>
    </div>
  );

  if (phase === "config") {
    return (
      wrap(
        <>
        <OnboardingBanner id="draft" seen={onboardingSeen} dismiss={dismissOnboarding}>
          Have your physical racer cards nearby — you'll flip them face-up as you go. This
          assistant runs the picks and roll-off; the cards themselves stay on the table.
        </OnboardingBanner>
        <p className="font-mono text-xs mb-1.5" style={{ color: "var(--muted)" }}>
          Variant
        </p>
        <div className="space-y-1.5 mb-3">
          {Object.entries(DRAFT_VARIANTS).map(([id, v]) => (
            <button
              key={id}
              onClick={() => chooseVariant(id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm border-2"
              style={{
                background: variantId === id ? "var(--green)" : "var(--paper)",
                color: variantId === id ? "var(--paper2)" : "var(--ink)",
                borderColor: variantId === id ? "var(--green)" : "var(--ink)",
              }}
            >
              {v.label}
            </button>
          ))}
        </div>

        {variant.minPlayers !== variant.maxPlayers && (
          <>
            <p className="font-mono text-xs mb-1.5" style={{ color: "var(--muted)" }}>
              Players
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {Array.from({ length: variant.maxPlayers - variant.minPlayers + 1 }, (_, k) => variant.minPlayers + k).map(
                (n) => (
                  <button
                    key={n}
                    onClick={() => setCount(n)}
                    className="w-12 h-12 rounded-lg text-sm font-mono font-bold border-2"
                    style={{
                      background: playerCount === n ? "var(--yellow)" : "var(--paper)",
                      borderColor: playerCount === n ? "var(--yellow)" : "var(--ink)",
                      color: "var(--ink)",
                    }}
                  >
                    {n}
                  </button>
                )
              )}
            </div>
          </>
        )}

        {variantId === "standard" && (
          <>
            <p className="font-mono text-xs mb-1.5" style={{ color: "var(--muted)" }}>
              Races in this game
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  onClick={() => setRaceCount(n)}
                  className="w-12 h-12 rounded-lg text-sm font-mono font-bold border-2"
                  style={{
                    background: raceCount === n ? "var(--yellow)" : "var(--paper)",
                    borderColor: raceCount === n ? "var(--yellow)" : "var(--ink)",
                    color: "var(--ink)",
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            {raceCount !== 4 && (
              <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
                House rule — the official game is 4 races. Draft team sizes stay the same either
                way, so everyone will have unraced benched racers left over at {raceCount}.
              </p>
            )}
          </>
        )}

        <p className="font-mono text-xs mb-1.5" style={{ color: "var(--muted)" }}>
          Player names (optional)
        </p>
        <div className="space-y-1.5 mb-3">
          {Array.from({ length: playerCount }, (_, i) => (
            <input
              key={i}
              value={playerNames[i] || ""}
              onChange={(e) =>
                setPlayerNames((prev) => {
                  const next = [...prev];
                  next[i] = e.target.value;
                  return next;
                })
              }
              placeholder={`Player ${i + 1}`}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
            />
          ))}
        </div>

        <div
          className="rounded-lg p-2.5 mb-3 text-xs"
          style={{ background: "var(--highlight)", color: "var(--ink)" }}
        >
          Flip <strong>{cardCount}</strong> racer cards face-up in a line. Each player will end with{" "}
          <strong>{variant.teamSize}</strong> racers.
        </div>

        {hasDuplicateLabels && (
          <p className="text-xs mb-2" style={{ color: "var(--red)" }}>
            Two players share the same name — give them different names so their teams don't get mixed up.
          </p>
        )}

        <button
          onClick={startRolloff}
          disabled={hasDuplicateLabels}
          className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          Roll off for draft order
        </button>
        </>
      )
    );
  }

  if (phase === "rolloff") {
    return (
      wrap(
        <>
        {/* Roll mode toggle */}
        <div
          className="inline-flex rounded-full p-1 gap-1 mb-3"
          style={{ background: "var(--paper)", border: "1.5px solid var(--ink)" }}
        >
          {[
            ["app", "App dice"],
            ["physical", "Physical dice"],
          ].map(([id, lbl]) => (
            <button
              key={id}
              onClick={() => switchRollMode(id)}
              className="px-3 py-1 rounded-full text-xs font-mono font-semibold"
              style={{
                background: rollMode === id ? "var(--red)" : "transparent",
                color: rollMode === id ? "var(--paper2)" : "var(--muted)",
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
          {tieGroup
            ? rollMode === "app"
              ? "Tie for the top roll — just the tied players roll again."
              : "Tie for the top roll — enter the tied players' re-rolls."
            : rollMode === "app"
            ? "Everyone rolls one die in the app. Highest drafts first."
            : "Roll your own dice, then enter each player's result (1–6). Highest drafts first."}
        </p>
        <div className="space-y-1.5 mb-3">
          {contenders.map((seat) => {
            const isRolling = rollingFaces[seat] != null;
            const isTop = rollMode === "app" && topRoll != null && rolls[seat] === topRoll;
            return (
            <div
              key={seat}
              className="flex items-center justify-between px-3 py-2 rounded-lg transition-colors"
              style={{
                background: isTop ? "var(--highlight)" : "var(--paper)",
                minHeight: rollMode === "app" ? 64 : undefined,
              }}
            >
              <span className="text-sm font-medium">{labelFor(seat)}</span>
              {rollMode === "physical" ? (
                <input
                  type="number"
                  min="1"
                  max="6"
                  inputMode="numeric"
                  value={rolls[seat] ?? ""}
                  onChange={(e) => setManualRoll(seat, e.target.value)}
                  placeholder="1–6"
                  className="w-16 px-2 py-1.5 rounded border text-sm font-mono text-center"
                  style={{ borderColor: "var(--ink)", background: "var(--paper2)" }}
                  aria-label={`${labelFor(seat)} die roll`}
                />
              ) : isRolling || rolls[seat] != null ? (
                <span
                  className="flex items-center gap-3"
                  role="status"
                  aria-label={isRolling ? `${labelFor(seat)} is rolling` : `${labelFor(seat)} rolled ${rolls[seat]}`}
                >
                  {isTop && (
                    <span className="text-xs font-mono font-bold" style={{ color: "var(--red)" }}>
                      {topCount > 1 ? "TIE" : "FIRST"}
                    </span>
                  )}
                  {!isRolling && (
                    <span className="font-mono font-bold text-lg" style={{ color: "var(--red)" }}>
                      {rolls[seat]}
                    </span>
                  )}
                  <DieFace
                    value={isRolling ? rollingFaces[seat] : rolls[seat]}
                    size={48}
                    color="var(--red)"
                    className={isRolling ? "dice-shake" : "dice-land"}
                  />
                </span>
              ) : (
                <button
                  onClick={() => rollFor(seat)}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold"
                  style={{ background: "var(--purple)", color: "var(--paper2)", border: "2px solid var(--ink)" }}
                >
                  Roll
                </button>
              )}
            </div>
            );
          })}
        </div>
        <button
          onClick={resolveRolloff}
          disabled={!allRolled}
          className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          {tieGroup ? "Resolve tie" : "Confirm order"}
        </button>
        </>
      )
    );
  }

  if (phase === "enter_cards") {
    return (
      wrap(
        <>
        <div
          className="rounded-lg p-2.5 mb-3 text-xs"
          style={{ background: "var(--highlight)", color: "var(--ink)" }}
        >
          Draft order:{" "}
          <strong>{seatOrder.map((s) => labelFor(s)).join(" → ")}</strong>
          {totalWaves > 1 && (
            <div className="mt-1">
              Card line <strong>{waveIndex + 1}</strong> of {totalWaves}
              {waveIndex > 0 && " — flip a fresh line of racers"}
            </div>
          )}
        </div>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Type a few letters of each of the {cardCount} face-up racers and tap the match, or browse
          the full list.
        </p>
        <button
          type="button"
          onClick={() => setBrowseOpen(true)}
          className="w-full py-2.5 rounded-lg text-sm font-bold mb-2"
          style={{ background: "var(--purple)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          Browse all racers · {cardInputs.filter((c) => (c || "").trim()).length}/{cardCount}
        </button>
        <div className="space-y-1.5 mb-3">
          {Array.from({ length: cardCount }, (_, i) => {
            // Leave out racers already drafted in earlier lines, and ones typed in other cards.
            const ex = new Set(bankedNorm);
            cardInputs.forEach((c, j) => {
              if (j !== i && (c || "").trim()) ex.add(normName(c));
            });
            return (
              <RacerNameField
                key={i}
                value={cardInputs[i] || ""}
                onChange={(v) => setCard(i, v)}
                onAccept={() => focusNextCard(i)}
                exclude={ex}
                inputRef={(el) => (cardRefs.current[i] = el)}
                placeholder={`Card ${i + 1}`}
                enterKeyHint={i === cardCount - 1 ? "done" : "next"}
                className="w-full px-3 py-2 rounded-lg border text-sm"
                style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
              />
            );
          })}
        </div>
        <RacerBrowseSheet
          open={browseOpen}
          onClose={() => setBrowseOpen(false)}
          values={cardInputs.slice(0, cardCount)}
          count={cardCount}
          onToggle={toggleBrowse}
          blocked={bankedNorm}
          tagFor={usedTag}
        />
        {!cardsValid && cardInputs.some((c) => c.trim()) && (
          <p className="text-xs mb-2" style={{ color: "var(--red)" }}>
            {cardInputs.some((c) => bankedNames.has(c.trim().toLowerCase()))
              ? "One of these racers was already drafted in an earlier line — use different racers."
              : `Fill all ${cardCount} cards with different racers.`}
          </p>
        )}
        <div
          className="sticky bottom-0 pt-2 pb-1"
          style={{ background: "linear-gradient(to top, var(--paper2) 70%, transparent)" }}
        >
          <button
            onClick={beginPicking}
            disabled={!cardsValid}
            className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            Start picking
          </button>
        </div>
        </>
      )
    );
  }

  if (phase === "picking") {
    const currentSeat = snakeSeq[pickIndex];
    const roundInfo = `Pick ${pickIndex + 1} of ${snakeSeq.length}`;
    return (
      wrap(
        <>
        <OnboardingBanner id="draftSnake" seen={onboardingSeen} dismiss={dismissOnboarding}>
          Snake draft: the pick order reverses each round, so whoever picks last in a round picks
          first in the next. Everyone drafts in plain sight — keep an eye on what rivals take, and
          on combos between your own racers.
        </OnboardingBanner>
        <div
          className="rounded-lg p-3 mb-3 text-center"
          style={{ background: "var(--green)", color: "var(--paper2)" }}
        >
          <p className="font-mono text-xs opacity-90">
            {totalWaves > 1 ? `Line ${waveIndex + 1}/${totalWaves} · ${roundInfo}` : roundInfo}
          </p>
          <p className="font-display font-bold text-xl">{labelFor(currentSeat)} picks</p>
        </div>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {availableCards.map((c) => (
            <button
              key={c}
              onClick={() => makePick(c)}
              className="px-3 py-2 rounded-full text-sm font-medium border-2"
              style={{ background: "var(--paper)", borderColor: "var(--ink)", color: "var(--ink)" }}
            >
              {c}
            </button>
          ))}
        </div>
        {pickIndex > 0 && (
          <button
            onClick={undoPick}
            className="w-full py-2 rounded-lg text-xs font-medium mb-2"
            style={{ background: "var(--paper)", color: "var(--ink)", border: "1.5px solid var(--ink)" }}
          >
            <RotateCcw size={13} className="inline" /> Undo last pick
          </button>
        )}
        <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>
          Tap a racer from this line to redo the draft from that pick.
        </p>
        <div className="mt-1 space-y-1.5">
          {Array.from({ length: playerCount }, (_, seat) => {
            const banked = (bankedTeams && bankedTeams[seat]) || [];
            const theirPicks = snakeSeq
              .map((s, i) => (s === seat ? { name: picks[i], slot: i } : null))
              .filter((x) => x && x.name);
            return (
              <div key={seat} className="flex items-start gap-2 text-xs">
                <span className="font-medium shrink-0 pt-1" style={{ color: "var(--muted)" }}>
                  {labelFor(seat)}:
                </span>
                {banked.length === 0 && theirPicks.length === 0 ? (
                  <span className="pt-1">—</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {/* Banked racers from earlier lines — locked, not rewindable */}
                    {banked.map((name, k) => (
                      <span
                        key={`b${k}`}
                        className="px-2 py-0.5 rounded-full"
                        style={{ background: "var(--highlight)", color: "var(--ink)" }}
                      >
                        {name}
                      </span>
                    ))}
                    {/* Current line's picks — tappable to rewind */}
                    {theirPicks.map((p) => (
                      <button
                        key={p.slot}
                        onClick={() => undoPickAt(p.slot)}
                        className="px-2 py-0.5 rounded-full border"
                        style={{ background: "var(--paper)", borderColor: "var(--ink)", color: "var(--ink)" }}
                        aria-label={`Redo draft from ${p.name}`}
                      >
                        {p.name} ✕
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </>
      )
    );
  }

  // phase === "done"
  const teams = buildTeams();
  return (
    wrap(
      <>
      <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
        Draft complete!
      </p>
      <p className="text-xs mb-3" style={{ color: "var(--muted)" }}>
        Each player's first racer will be fielded for race 1. The rest are saved for later races.
        {variantId === "standard" && ` This game is set for ${raceCount} race${raceCount === 1 ? "" : "s"}.`}
        {variantId !== "standard" &&
          " This variant's race count isn't tracked automatically — use the benches below to field racers as you go."}
      </p>
      <div className="space-y-2 mb-3">
        {teams.map((t, i) => (
          <div key={i} className="rounded-lg p-2.5" style={{ background: "var(--paper)" }}>
            <p className="font-display font-bold text-sm">{t.player}</p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              {t.racers.map((name, idx) => (idx === 0 ? `${name} (race 1)` : name)).join(" · ")}
            </p>
          </div>
        ))}
      </div>
      <button
        onClick={() => onApply(teams, variantId, raceCount)}
        className="w-full py-3 rounded-lg text-sm font-bold"
        style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
      >
        Load race 1 roster
      </button>
      </>
    )
  );
}

// Between-races turn order, per the rulebook — the rule differs by variant:
// standard & 3-player-double use board position ("farthest behind racer
// goes first"); 2-player uses points ("lower points goes first, tied ->
// roll off"). Only the single starting player is rule-mandated — after that,
// play continues in normal seating order, which the app doesn't know.
function TurnOrderCard({ draftVariantId, lastRaceOrder, lastRacePoints }) {
  const [tieRolls, setTieRolls] = useState({});

  // Reset any in-progress roll-off whenever a new race's points come in.
  useEffect(() => {
    setTieRolls({});
  }, [lastRacePoints]);

  if (draftVariantId === "two_player" && lastRacePoints && lastRacePoints.length === 2) {
    const [a, b] = lastRacePoints;
    if (a.points !== b.points) {
      return (
        <Card>
          <SectionTitle icon={Flag}>Turn order</SectionTitle>
          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            {a.player} goes first — {a.points} points last race vs {b.player}'s {b.points}.
          </p>
        </Card>
      );
    }
    // Tied on points — roll off, per the rulebook.
    const rollA = tieRolls[a.player];
    const rollB = tieRolls[b.player];
    const bothRolled = rollA != null && rollB != null;
    const rollTied = bothRolled && rollA === rollB;
    const winnerPlayer = bothRolled && !rollTied ? (rollA > rollB ? a.player : b.player) : null;
    return (
      <Card>
        <SectionTitle icon={Flag}>Turn order — tied, roll off!</SectionTitle>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Both scored {a.points} points last race. Roll to see who goes first.
        </p>
        <div className="flex gap-1.5 mb-2">
          {[a.player, b.player].map((p) => (
            <button
              key={p}
              onClick={() => setTieRolls((prev) => ({ ...prev, [p]: rollSingleDie() }))}
              className="flex-1 py-2.5 rounded-lg text-sm font-bold border-2"
              style={{ background: "var(--paper)", borderColor: "var(--ink)", color: "var(--ink)" }}
            >
              {p}
              {tieRolls[p] != null ? `: 🎲 ${tieRolls[p]}` : ": Roll"}
            </button>
          ))}
        </div>
        {rollTied && (
          <p className="text-xs font-medium" style={{ color: "var(--red)" }}>
            Tied again — roll again!
          </p>
        )}
        {winnerPlayer && (
          <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
            {winnerPlayer} goes first!
          </p>
        )}
      </Card>
    );
  }

  if (
    (draftVariantId === "standard" || draftVariantId === "three_double") &&
    lastRaceOrder &&
    lastRaceOrder.length > 0
  ) {
    const first = lastRaceOrder[0];
    return (
      <Card>
        <SectionTitle icon={Flag}>Turn order</SectionTitle>
        <p className="text-sm font-medium mb-1" style={{ color: "var(--ink)" }}>
          {first.player ? `${first.player} goes first` : `${first.name} goes first`} — their racer
          ({first.name}) was farthest behind last race.
        </p>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          After that, continue in your normal seating order. Full last-race order, for reference:{" "}
          {lastRaceOrder.map((r) => (r.player ? `${r.name} (${r.player})` : r.name)).join(" → ")}
        </p>
      </Card>
    );
  }

  return null;
}

// Read-only overview of every drafted player's racers: spent in earlier races,
// fielded for this one, and still saved for later. Racers are drafted in plain
// sight, so this mirrors what's already on the table — it just saves everyone
// from remembering who still holds what across four races.
function HoldingsCard({ draftPlayers, usedRacers, draftedTeams, racers }) {
  if (!draftPlayers || draftPlayers.length === 0) return null;
  const rows = draftPlayers.map((p) => {
    const used = (usedRacers && usedRacers[p]) || [];
    const now = racers.filter((r) => r.player === p && r.name.trim()).map((r) => r.name);
    const bench = (draftedTeams && draftedTeams.find((t) => t.player === p)?.racers) || [];
    return { player: p, used, now, bench };
  });
  if (rows.every((r) => r.used.length + r.now.length + r.bench.length === 0)) return null;

  const pill = {
    spent: {
      background: "transparent",
      color: "var(--muted)",
      border: "1.5px solid var(--muted)",
      textDecoration: "line-through",
      opacity: 0.8,
    },
    now: { background: "var(--yellow)", color: "var(--ink)", border: "2px solid var(--ink)", fontWeight: 700 },
    saved: { background: "var(--paper2)", color: "var(--ink)", border: "1.5px solid var(--ink)" },
  };

  return (
    <Card>
      <SectionTitle icon={Users}>Who's holding what</SectionTitle>
      <div className="flex flex-wrap gap-1.5 mb-2" aria-hidden="true">
        <span className="px-2 py-0.5 rounded-full text-xs font-mono" style={pill.spent}>spent</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-mono" style={pill.now}>this race</span>
        <span className="px-2 py-0.5 rounded-full text-xs font-mono" style={pill.saved}>saved</span>
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.player} className="rounded-lg p-2" style={{ background: "var(--paper)" }}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-display font-bold text-sm">{row.player}</p>
              <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                {row.bench.length} saved
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.used.map((u) => (
                <span
                  key={`${u.race}-${u.name}`}
                  className="px-2.5 py-1 rounded-full text-xs"
                  style={pill.spent}
                  title={`Raced in race ${u.race}`}
                >
                  {u.name} <span className="font-mono" style={{ fontSize: 10 }}>R{u.race}</span>
                </span>
              ))}
              {row.now.map((n) => (
                <span key={`now-${n}`} className="px-2.5 py-1 rounded-full text-xs" style={pill.now}>
                  {n}
                </span>
              ))}
              {row.now.length === 0 && row.bench.length > 0 && (
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-mono"
                  style={{ border: "1.5px dashed var(--muted)", color: "var(--muted)" }}
                >
                  field one from the benches
                </span>
              )}
              {row.bench.map((n) => (
                <span key={`bench-${n}`} className="px-2.5 py-1 rounded-full text-xs" style={pill.saved}>
                  {n}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function SetupTab({
  racers,
  addRacer,
  updateRacer,
  removeRacer,
  trackLength,
  setTrackLength,
  trackName = "mild",
  setTrackName = () => {},
  updateHouseRule = () => {},
  status,
  startRace,
  validCount,
  onStartDraft,
  draftedTeams,
  fieldDraftedRacer,
  gameSession,
  draftVariantId,
  lastRaceOrder,
  lastRacePoints,
  draftPlayers,
  usedRacers,
  onboardingSeen = {},
  dismissOnboarding = () => {},
}) {
  const locked = status !== "setup";
  const [expanded, setExpanded] = useState({});
  const toggleExpanded = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  return (
    <div>
      {!locked && gameSession && (
        <Card>
          <SectionTitle icon={Flag}>
            Race {gameSession.raceNumber} of {gameSession.totalRaces}
          </SectionTitle>
        </Card>
      )}
      {!locked && (
        <TurnOrderCard
          draftVariantId={draftVariantId}
          lastRaceOrder={lastRaceOrder}
          lastRacePoints={lastRacePoints}
        />
      )}
      {!locked && draftedTeams && draftedTeams.length > 0 && (
        <Card>
          <SectionTitle icon={Users}>Drafted benches</SectionTitle>
          <OnboardingBanner id="fieldingTip" seen={onboardingSeen} dismiss={dismissOnboarding}>
            Strategy tip: a racer you field is spent for the rest of the game, so some players hold
            their strongest back for later races. Check "Who's holding what" below — your rivals may
            be doing the same.
          </OnboardingBanner>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            Field each player's next racer for this race. Their current racer swaps back to the bench.
          </p>
          <div className="space-y-2">
            {draftedTeams.map((t) => (
              <div key={t.player} className="rounded-lg p-2" style={{ background: "var(--paper)" }}>
                <p className="font-display font-bold text-sm mb-1">{t.player}</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.racers.map((name) => (
                    <button
                      key={name}
                      onClick={() => fieldDraftedRacer(t.player, name)}
                      className="px-2.5 py-1.5 rounded-full text-xs font-medium border"
                      style={{ background: "var(--paper2)", borderColor: "var(--ink)", color: "var(--ink)" }}
                    >
                      Field {name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
      {!locked && (
        <HoldingsCard
          draftPlayers={draftPlayers}
          usedRacers={usedRacers}
          draftedTeams={draftedTeams}
          racers={racers}
        />
      )}
      {!locked && (
        <Card>
          <SectionTitle icon={Dices}>Draft teams</SectionTitle>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            Run the official pre-game draft — roll off for order, then snake-pick racers from the
            face-up line. The app fills in your roster when you're done.
          </p>
          <button
            onClick={onStartDraft}
            className="w-full py-2.5 rounded-lg text-sm font-bold"
            style={{ background: "var(--purple)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            Run a draft
          </button>
        </Card>
      )}
      <Card>
        <SectionTitle icon={Flag}>Track</SectionTitle>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Track">
          {[
            ["mild", "Mild Mile", "Plain track"],
            ["wild", "Wild Wilds", "Star spaces"],
          ].map(([id, label, sub]) => {
            const on = trackName === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={locked}
                onClick={() => {
                  setTrackName(id);
                  setTrackLength(20);
                  updateHouseRule("bronzeEnabled", id === "wild");
                }}
                className="rounded-lg px-3 py-2 text-left"
                style={{
                  background: on ? "var(--red)" : "var(--paper2)",
                  color: on ? "var(--paper2)" : "var(--ink)",
                  border: "2.5px solid var(--ink)",
                  opacity: locked && !on ? 0.5 : 1,
                }}
              >
                <span className="block text-sm font-bold">{label}</span>
                <span className="block font-mono text-xs">20 spaces · {sub}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (trackName === "custom") {
              setTrackName("mild");
              setTrackLength(20);
              updateHouseRule("bronzeEnabled", false);
            } else setTrackName("custom");
          }}
          className="mt-2 text-xs font-mono underline"
          style={{ color: "var(--muted)" }}
        >
          {trackName === "custom" ? "Use a standard track" : "Custom length…"}
        </button>
        {gameSession && gameSession.raceNumber > 1 && trackName !== "custom" && (
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Board flipped after the last race — Race {gameSession.raceNumber} is on{" "}
            {trackName === "wild" ? "Wild Wilds" : "Mild Mile"}.
          </p>
        )}
        {trackName === "custom" && (
          <div className="flex items-center gap-3 mt-2">
            <input
              type="range"
              min="10"
              max="60"
              value={trackLength}
              disabled={locked}
              onChange={(e) => setTrackLength(parseInt(e.target.value))}
              className="flex-1"
            />
            <span className="font-mono font-semibold text-sm" style={{ color: "var(--red)" }}>
              {trackLength} spaces
            </span>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle icon={Users}>Racers</SectionTitle>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Type a few letters and tap the match from the official 36 — or enter your own for a
          custom or expansion racer.
        </p>
        <div className="space-y-3">
          {racers.map((r, i) => (
            <div key={r.id} className="rounded-lg p-2" style={{ background: "var(--paper)" }}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div>
                    <span className="block font-mono text-[11px] mb-0.5" style={{ color: "var(--muted)" }}>
                      PLAYER (optional)
                    </span>
                    <input
                      value={r.player}
                      disabled={locked}
                      onChange={(e) => updateRacer(r.id, { player: e.target.value })}
                      placeholder="Who is racing?"
                      aria-label={`Racer ${i + 1} player`}
                      autoComplete="off"
                      className="w-full px-2 py-1.5 rounded border text-sm"
                      style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
                    />
                  </div>
                  <div>
                    <span className="block font-mono text-[11px] mb-0.5" style={{ color: "var(--muted)" }}>
                      RACER
                    </span>
                    <RacerNameField
                      value={r.name}
                      disabled={locked}
                      onChange={(v) => updateRacer(r.id, { name: v })}
                      exclude={new Set(racers.filter((o) => o.id !== r.id && o.name.trim()).map((o) => normName(o.name)))}
                      placeholder={`Racer ${i + 1} name`}
                      ariaLabel={`Racer ${i + 1} name`}
                      enterKeyHint="done"
                      className="w-full px-2 py-1.5 rounded border text-sm font-medium"
                      style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
                    />
                  </div>
                </div>
                {!locked && racers.length > 2 && (
                  <button
                    onClick={() => removeRacer(r.id)}
                    className="shrink-0 flex items-center justify-center"
                    aria-label={`Remove ${r.name || "racer"}`}
                  >
                    <X size={18} color="var(--red)" />
                  </button>
                )}
              </div>
              {/* Colour swatches: each button is a 48px hit area around a 26px dot.
                  A colour already worn by another racer is dimmed and can't be picked. */}
              <div className="flex flex-wrap items-center mt-1 mb-1">
                {PALETTE.map((c) => {
                  const takenBy = racers.find((o) => o.id !== r.id && o.color === c);
                  return (
                    <button
                      key={c}
                      type="button"
                      disabled={locked || !!takenBy}
                      onClick={() => !locked && !takenBy && updateRacer(r.id, { color: c })}
                      className="flex items-center justify-center"
                      aria-label={
                        takenBy
                          ? `Colour already used by ${takenBy.name || "another racer"}`
                          : `Set ${r.name || "racer"}'s color`
                      }
                      aria-pressed={r.color === c}
                      style={{ background: "transparent", opacity: takenBy ? 0.25 : 1 }}
                    >
                      <span
                        className="block rounded-full"
                        style={{
                          width: 26,
                          height: 26,
                          background: c,
                          border: "3px solid",
                          borderColor: r.color === c ? "var(--ink)" : "transparent",
                        }}
                      />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => toggleExpanded(r.id)}
                className="text-xs font-mono px-1 py-1"
                style={{ color: "var(--muted)" }}
              >
                {expanded[r.id] ? "▲ hide notes" : "▼ add ability notes"}
              </button>
              {expanded[r.id] && (
                <input
                  value={r.notes}
                  disabled={locked}
                  onChange={(e) => updateRacer(r.id, { notes: e.target.value })}
                  placeholder="ability notes (optional)"
                  className="w-full mt-1.5 px-2 py-1 rounded border text-xs"
                  style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
                />
              )}
            </div>
          ))}
        </div>
        {!locked && (
          <button
            onClick={addRacer}
            className="mt-3 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg"
            style={{ background: "var(--green)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            <Plus size={14} /> Add racer
          </button>
        )}
      </Card>

      {status === "setup" && (
        <div className="sticky bottom-3 z-20 pt-1">
          <button
            onClick={startRace}
            disabled={validCount < 2}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-display font-bold text-base disabled:opacity-40 shadow-lg"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "3px solid var(--ink)", boxShadow: "5px 5px 0px var(--ink)" }}
          >
            <Play size={18} /> Lock roster &amp; start race
          </button>
        </div>
      )}
      {validCount < 2 && status === "setup" && (
        <p className="text-center text-xs mt-2" style={{ color: "var(--onBg)" }}>
          Add at least two named racers to start.
        </p>
      )}
    </div>
  );
}

// Reconstructs the race from the turn log, move by move, and animates it —
// a free payoff for data the app was already tracking. turnLog is
// newest-first (how it's displayed elsewhere), so it's reversed here for
// chronological playback. Already-undone moves aren't in the log at all, so
// replaying it exactly reproduces the real final positions.
function ReplayView({ racers, turnLog, trackLength }) {
  const chronological = [...turnLog].reverse();
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!playing) return;
    if (step >= chronological.length) {
      setPlaying(false);
      return;
    }
    timerRef.current = setTimeout(() => setStep((s) => s + 1), 550);
    return () => clearTimeout(timerRef.current);
  }, [playing, step, chronological.length]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const play = () => {
    if (step >= chronological.length) setStep(0);
    setPlaying(true);
  };
  const pause = () => setPlaying(false);
  const restart = () => {
    setStep(0);
    setPlaying(true);
  };

  const positions = {};
  racers.forEach((r) => {
    positions[r.name] = 0;
  });
  for (let i = 0; i < step; i++) {
    const move = chronological[i];
    const prev = positions[move.racerName] || 0;
    positions[move.racerName] = Math.max(0, Math.min(trackLength, prev + move.delta));
  }

  if (chronological.length === 0) {
    return (
      <Card>
        <SectionTitle icon={Clock}>Instant replay</SectionTitle>
        <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
          No moves were logged for this race.
        </p>
      </Card>
    );
  }

  const currentMove = step > 0 ? chronological[step - 1] : null;
  const sorted = [...racers].sort((a, b) => (positions[b.name] || 0) - (positions[a.name] || 0));
  const done = step >= chronological.length;

  return (
    <Card>
      <SectionTitle icon={Clock}>Instant replay</SectionTitle>
      <div className="space-y-1.5 mb-3">
        {sorted.map((r) => {
          const pos = positions[r.name] || 0;
          return (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span
                className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                style={{ background: r.color }}
              />
              <span className="w-20 truncate shrink-0">{r.name}</span>
              <div
                className="relative h-2 rounded-full flex-1 overflow-hidden"
                style={{ background: "var(--highlight)" }}
              >
                <div
                  className="absolute top-0 left-0 h-full rounded-full"
                  style={{
                    width: `${(pos / trackLength) * 100}%`,
                    background: r.color,
                    transition: "width 500ms ease-out",
                  }}
                />
              </div>
              <span
                className="font-mono text-xs w-12 text-right shrink-0"
                style={{ color: "var(--muted)" }}
              >
                {pos}/{trackLength}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-center mb-2" style={{ minHeight: 20 }}>
        {currentMove && (
          <p className="font-mono text-sm font-medium" style={{ color: "var(--ink)" }}>
            {currentMove.racerName} {currentMove.delta >= 0 ? "+" : ""}
            {currentMove.delta}
          </p>
        )}
      </div>

      <div className="flex gap-2 mb-1.5">
        {playing ? (
          <button
            onClick={pause}
            className="flex-1 py-2 rounded-lg text-sm font-bold"
            style={{ background: "var(--paper)", color: "var(--ink)", border: "2px solid var(--ink)" }}
          >
            Pause
          </button>
        ) : (
          <button
            onClick={play}
            className="flex-1 py-2 rounded-lg text-sm font-bold"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "2px solid var(--ink)" }}
          >
            {done ? "▶ Replay again" : step === 0 ? "▶ Play" : "▶ Resume"}
          </button>
        )}
        <button
          onClick={restart}
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--paper)", color: "var(--ink)", border: "2px solid var(--ink)" }}
          aria-label="Restart replay"
        >
          <RotateCcw size={15} />
        </button>
      </div>
      <p className="text-center font-mono text-xs" style={{ color: "var(--muted)" }}>
        Move {step} of {chronological.length}
      </p>
    </Card>
  );
}

function BettingTab(props) {
  const {
    status,
    bettors,
    newBettorName,
    setNewBettorName,
    addBettor,
    removeBettor,
    racers,
    betBettor,
    setBetBettor,
    betRacer,
    setBetRacer,
    betAmount,
    setBetAmount,
    betType,
    setBetType,
    placeBet,
    bets,
    removeBet,
    poolByRacer,
    totalPool,
    winner,
    runnerUp,
    results,
    winnerOdds,
    odds,
    rollOdds,
    oddsLocked,
    saveToHistory,
    savedThisRace,
    savingResult,
    saveError,
    newRaceKeepPeople,
    goldPoints,
    setGoldPoints,
    silverPoints,
    setSilverPoints,
    specEnabled,
    sessionPin,
    enableSpectatorBetting,
    disableSpectatorBetting,
    gameSession,
    bronzePoints,
    setBronzePoints,
    bankrolls,
    turnLog,
    trackLength,
    onboardingSeen,
    dismissOnboarding,
    houseRules,
  } = props;

  const [showReplay, setShowReplay] = useState(false);

  const bettingOn = houseRules ? houseRules.bettingEnabled !== false : true;
  const bronzeOn = houseRules ? houseRules.bronzeEnabled !== false : true;
  const bettingOpen = status === "setup";
  // On the last race of a tracked game, advancing ends the game rather than
  // starting another race — label it accordingly.
  const isFinalRace = !!gameSession && gameSession.raceNumber >= gameSession.totalRaces;
  // Distinct player labels in this race, for bronze chip attribution.
  const racePlayers = [...new Set(racers.map((r) => r.player).filter((p) => p && p.trim()))];

  if (status === "finished") {
    return (
      <div>
        <Confetti />
        <Card>
          <div className="text-center winner-pop">
            <Trophy size={36} color="var(--yellow)" className="mx-auto mb-2 trophy-glow" />
            <p className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--red)" }}>
              Winner
            </p>
            <p className="font-display font-bold text-3xl" style={{ color: "var(--ink)" }}>
              {winner ? winner.name : "—"}
            </p>
            {winner?.player && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                racing for {winner.player}
              </p>
            )}
            {runnerUp && (
              <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                2nd: {runnerUp.name}
                {runnerUp.player ? ` (${runnerUp.player})` : ""}
              </p>
            )}
            {(bettingOn || results.length > 0) && (
              <p className="font-mono text-xs mt-1" style={{ color: "var(--mutedGreen)" }}>
                Winning odds were ×{winnerOdds ? winnerOdds.toFixed(2) : "0.00"} · {totalPool.toFixed(2)} total staked
              </p>
            )}
            <button
              onClick={() => setShowReplay((v) => !v)}
              className="mt-3 px-4 py-2 rounded-full text-sm font-medium"
              style={{ background: "var(--paper)", color: "var(--ink)", border: "2px solid var(--ink)" }}
            >
              {showReplay ? "Hide replay" : "▶ Watch instant replay"}
            </button>
          </div>
        </Card>

        {showReplay && <ReplayView racers={racers} turnLog={turnLog} trackLength={trackLength} />}

        <OnboardingBanner id="chips" seen={onboardingSeen} dismiss={dismissOnboarding}>
          Gold and silver are the real point values printed on your chips. Bronze is only for the
          Wild Wilds track's star spaces — leave it blank if you're not using that side.
        </OnboardingBanner>

        <Card>
          <SectionTitle icon={Trophy}>Chips awarded</SectionTitle>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            Enter the point value on the gold and silver chips you actually drew, so standings can
            track them across races.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-mono uppercase" style={{ color: "var(--red)" }}>
                Gold (1st)
              </label>
              <input
                type="number"
                min="0"
                value={goldPoints}
                onChange={(e) => setGoldPoints(e.target.value)}
                placeholder="points"
                className="w-full mt-0.5 px-2 py-1.5 rounded border text-sm"
                style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
              />
            </div>
            <div>
              <label className="text-xs font-mono uppercase" style={{ color: "var(--muted)" }}>
                Silver (2nd)
              </label>
              <input
                type="number"
                min="0"
                value={silverPoints}
                onChange={(e) => setSilverPoints(e.target.value)}
                placeholder="points"
                className="w-full mt-0.5 px-2 py-1.5 rounded border text-sm"
                style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
              />
            </div>
          </div>
          {bronzeOn && racePlayers.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "#9B6B4A" }}>
                Bronze chips (star spaces)
              </p>
              <p className="text-xs mb-1.5" style={{ color: "var(--muted)" }}>
                Any bonus points picked up mid-race on the Wild Wilds track. Leave blank if none.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {racePlayers.map((p) => (
                  <div key={p}>
                    <label className="text-xs" style={{ color: "var(--ink)" }}>
                      {p}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={bronzePoints[p] ?? ""}
                      onChange={(e) =>
                        setBronzePoints((prev) => ({ ...prev, [p]: e.target.value }))
                      }
                      placeholder="0"
                      className="w-full mt-0.5 px-2 py-1.5 rounded border text-sm"
                      style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {(bettingOn || results.length > 0) && (
        <Card>
          <SectionTitle icon={Coins}>Payouts</SectionTitle>
          {results.length === 0 && (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No bets were placed on this race.
            </p>
          )}
          <div className="space-y-1.5">
            {results.map((r) => (
              <div
                key={r.name}
                className="flex items-center justify-between text-sm px-2 py-1.5 rounded"
                style={{ background: "var(--paper)" }}
              >
                <span className="font-medium">{r.name}</span>
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  staked {r.staked.toFixed(2)}
                </span>
                <span
                  className="font-mono text-sm font-semibold"
                  style={{ color: r.net >= 0 ? "var(--green)" : "var(--red)" }}
                >
                  {r.net >= 0 ? "+" : ""}
                  {r.net.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
          {Object.keys(bankrolls || {}).length > 0 && (
            <div className="mt-3 pt-2" style={{ borderTop: "1.5px solid var(--ink)" }}>
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "var(--muted)" }}>
                Running bankrolls{savedThisRace ? "" : " (updates when the result is saved)"}
              </p>
              <div className="space-y-0.5">
                {Object.entries(bankrolls)
                  .sort((a, b) => b[1] - a[1])
                  .map(([name, total]) => (
                    <div key={name} className="flex justify-between text-xs font-mono">
                      <span>{name}</span>
                      <span style={{ color: total >= 0 ? "var(--green)" : "var(--red)" }}>
                        {total >= 0 ? "+" : ""}
                        {total.toFixed(2)}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </Card>
        )}

        {saveError && (
          <p className="text-xs font-mono text-center mb-2" style={{ color: "var(--red)" }}>
            {saveError}
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={saveToHistory}
            disabled={savedThisRace || savingResult}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm disabled:opacity-50"
            style={{ background: "var(--green)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            <Save size={15} />{" "}
            {savedThisRace ? "Saved to history" : savingResult ? "Saving…" : "Save result"}
          </button>
          {savedThisRace ? (
            <button
              onClick={newRaceKeepPeople}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm"
              style={{ background: "var(--yellow)", color: "var(--ink)", border: "2.5px solid var(--ink)" }}
            >
              {isFinalRace ? (
                <>
                  <Trophy size={15} /> Finish game
                </>
              ) : (
                <>
                  <RotateCcw size={15} /> New race
                </>
              )}
            </button>
          ) : (
            <ConfirmButton
              onConfirm={newRaceKeepPeople}
              armedLabel="Tap again to discard"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-medium text-sm"
              style={{ background: "var(--yellow)", color: "var(--ink)", border: "2.5px solid var(--ink)" }}
            >
              {isFinalRace ? (
                <>
                  <Trophy size={15} /> Finish game
                </>
              ) : (
                <>
                  <RotateCcw size={15} /> New race
                </>
              )}
            </ConfirmButton>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {!bettingOn ? (
        <Card>
          <SectionTitle icon={Coins}>Betting is off</SectionTitle>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            This table has betting turned off (⚙ House rules). Chip scoring still works as
            normal — you'll see the results screen once the race finishes.
          </p>
        </Card>
      ) : (
      <>
      <OnboardingBanner id="betting" seen={onboardingSeen} dismiss={dismissOnboarding}>
        Betting is an app-only feature, not in the physical rulebook. Post odds below, then anyone
        can bet — payouts settle automatically when the race ends.
      </OnboardingBanner>

      {bettingOpen && (
        <>
          <OnboardingBanner id="spectatorBetting" seen={onboardingSeen} dismiss={dismissOnboarding}>
            Spectators can open this same page on their own phone and enter a code — you don't
            need to pass your device around the table.
          </OnboardingBanner>
          <Card>
            <SectionTitle icon={Coins}>Bet from your own phone</SectionTitle>
            {!specEnabled ? (
              <>
                <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
                  Turn this on and spectators can join with a 4-digit code and place bets from
                their own device instead of passing yours around.
              </p>
              <button
                onClick={enableSpectatorBetting}
                className="w-full py-2.5 rounded-lg text-sm font-bold"
                style={{ background: "var(--purple)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
              >
                📡 Enable spectator betting
              </button>
            </>
          ) : (
            <>
              <p className="text-xs mb-1" style={{ color: "var(--muted)" }}>
                Have spectators open this same page, tap "Join with a code," and enter — or send
                them the link below and the code fills in for them:
              </p>
              <JoinShare pin={sessionPin} />
              <button
                onClick={disableSpectatorBetting}
                className="w-full py-2 rounded-lg text-xs font-medium"
                style={{ background: "var(--paper)", color: "var(--muted)", border: "1.5px solid var(--ink)" }}
              >
                Stop hosting spectator betting
              </button>
            </>
          )}
        </Card>
        </>
      )}
      <Card>
        <SectionTitle icon={Users}>Spectators</SectionTitle>
        <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
          Anyone can bet on a racer, whether or not they're playing.
        </p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {bettors.map((b) => {
            const bal = bankrolls?.[b.name];
            return (
              <span
                key={b.id}
                className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium"
                style={{ background: "var(--highlight)" }}
              >
                {b.name}
                {bal != null && bal !== 0 && (
                  <span
                    className="font-mono"
                    style={{ color: bal >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {bal >= 0 ? "+" : ""}
                    {bal.toFixed(0)}
                  </span>
                )}
                <button onClick={() => removeBettor(b.id)} aria-label={`Remove ${b.name}`}>
                  <X size={11} />
                </button>
              </span>
            );
          })}
        </div>
        {bettingOpen && (
          <div className="flex gap-2">
            <input
              value={newBettorName}
              onChange={(e) => setNewBettorName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addBettor()}
              placeholder="Spectator name"
              className="flex-1 px-2 py-1.5 rounded border text-sm"
              style={{ borderColor: "var(--ink)", background: "var(--paper)" }}
            />
            <button
              onClick={addBettor}
              className="px-3 py-1.5 rounded-lg text-sm font-medium"
              style={{ background: "var(--green)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
            >
              <Plus size={14} />
            </button>
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle icon={Coins}>Odds board</SectionTitle>
        {racers.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Add racers first.
          </p>
        ) : (
          <React.Fragment>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                Racer
              </span>
              <div className="flex gap-3">
                <span className="font-mono text-xs w-14 text-right" style={{ color: "var(--muted)" }}>
                  Win
                </span>
                <span className="font-mono text-xs w-14 text-right" style={{ color: "var(--muted)" }}>
                  Place
                </span>
              </div>
            </div>
            <div className="space-y-1.5">
              {racers.map((r) => {
                const pool = poolByRacer[r.id] || 0;
                const racerOdds = odds[r.id];
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between text-sm px-2 py-1.5 rounded"
                    style={{ background: "var(--paper)" }}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                        style={{ background: r.color }}
                      />
                      <span className="truncate">{r.name}</span>
                    </span>
                    <div className="flex gap-3 shrink-0">
                      <span
                        className="font-mono text-sm font-semibold w-14 text-right"
                        style={{ color: "var(--red)" }}
                      >
                        {racerOdds ? `×${racerOdds.toFixed(2)}` : "—"}
                      </span>
                      <span
                        className="font-mono text-sm w-14 text-right"
                        style={{ color: "var(--muted)" }}
                      >
                        {racerOdds ? `×${placeOddsFor(racerOdds).toFixed(2)}` : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {bettingOpen && (
              <button
                onClick={rollOdds}
                disabled={oddsLocked}
                className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                style={{ background: "var(--purple)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
              >
                🎲 {Object.keys(odds).length ? "Reroll odds" : "Post odds"}
              </button>
            )}
            {oddsLocked && bettingOpen && (
              <p className="text-center text-xs font-mono mt-1.5" style={{ color: "var(--red)" }}>
                {bets.length > 0
                  ? "Odds are locked in — bets are already down."
                  : "Odds are locked while spectator betting is live."}
              </p>
            )}
          </React.Fragment>
        )}
        <p className="font-mono text-xs mt-2" style={{ color: "var(--muted)" }}>
          Odds are randomized fresh each race and lock the moment the first bet lands. A win bet
          only pays if your racer finishes 1st; a place bet pays if they finish 1st or 2nd, at a
          lower rate.
        </p>
      </Card>

      {bettingOpen && Object.keys(odds).length === 0 && racers.length > 0 && (
        <Card>
          <p className="text-sm text-center py-2" style={{ color: "var(--muted)" }}>
            Post odds above before spectators can bet.
          </p>
        </Card>
      )}

      {bettingOpen && Object.keys(odds).length > 0 && (
        <Card>
          <SectionTitle icon={Plus}>Place a bet</SectionTitle>

          <p className="text-xs font-mono uppercase mb-1.5" style={{ color: "var(--muted)" }}>
            Who's betting?
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {bettors.map((b) => (
              <button
                key={b.id}
                onClick={() => setBetBettor(b.name)}
                className="px-3 py-2 rounded-full text-sm font-medium border-2"
                style={{
                  background: betBettor === b.name ? "var(--red)" : "var(--paper)",
                  color: betBettor === b.name ? "var(--paper2)" : "var(--ink)",
                  borderColor: betBettor === b.name ? "var(--red)" : "var(--ink)",
                }}
              >
                {b.name}
              </button>
            ))}
          </div>

          <OnboardingBanner id="betType" seen={onboardingSeen} dismiss={dismissOnboarding}>
            Win only pays if your racer finishes 1st. Place pays if they finish 1st or 2nd, at a
            lower rate.
          </OnboardingBanner>

          <p className="text-xs font-mono uppercase mb-1.5" style={{ color: "var(--muted)" }}>
            Win or place?
          </p>
          <div className="flex gap-1.5 mb-3">
            {[
              ["win", "Win (1st only)"],
              ["place", "Place (top 2)"],
            ].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setBetType(id)}
                className="flex-1 px-3 py-2 rounded-full text-sm font-medium border-2"
                style={{
                  background: betType === id ? "var(--purple)" : "var(--paper)",
                  color: betType === id ? "var(--paper2)" : "var(--ink)",
                  borderColor: betType === id ? "var(--purple)" : "var(--ink)",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <p className="text-xs font-mono uppercase mb-1.5" style={{ color: "var(--muted)" }}>
            On which racer?
          </p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {racers.map((r) => {
              const shownOdds = betType === "win" ? odds[r.id] : placeOddsFor(odds[r.id]);
              return (
                <button
                  key={r.id}
                  onClick={() => setBetRacer(r.id)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium border-2"
                  style={{
                    background: betRacer === r.id ? "var(--green)" : "var(--paper)",
                    color: betRacer === r.id ? "var(--paper2)" : "var(--ink)",
                    borderColor: betRacer === r.id ? "var(--green)" : "var(--ink)",
                  }}
                >
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: r.color }} />
                  {r.name}
                  <span className="font-mono text-xs opacity-80">×{shownOdds ? shownOdds.toFixed(2) : "—"}</span>
                </button>
              );
            })}
          </div>

          <p className="text-xs font-mono uppercase mb-1.5" style={{ color: "var(--muted)" }}>
            Amount
          </p>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {[5, 10, 20, 50].map((n) => (
              <button
                key={n}
                onClick={() => setBetAmount(String(n))}
                className="px-3 py-2 rounded-lg text-sm font-mono font-semibold border-2"
                style={{
                  background: betAmount === String(n) ? "var(--yellow)" : "var(--paper)",
                  borderColor: betAmount === String(n) ? "var(--yellow)" : "var(--ink)",
                  color: "var(--ink)",
                }}
              >
                {n}
              </button>
            ))}
            <input
              type="number"
              min="0"
              step="0.5"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder="custom"
              className="flex-1 px-2 py-2 rounded-lg border text-sm"
              style={{ borderColor: "var(--ink)", background: "var(--paper)", minWidth: 80 }}
            />
          </div>

          <button
            onClick={placeBet}
            disabled={!betBettor || !betRacer || !betAmount}
            className="w-full py-3 rounded-lg text-sm font-bold disabled:opacity-40"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
          >
            Place bet
          </button>
        </Card>
      )}

      {bets.length > 0 && (
        <Card>
          <SectionTitle icon={Clock}>Bet slips</SectionTitle>
          <div className="space-y-1">
            {bets.map((b) => {
              const racer = racers.find((x) => x.id === b.racerId);
              const isWin = (b.betType || "win") === "win";
              return (
                <div key={b.id} className="flex items-center justify-between text-xs px-2 py-1">
                  <span className="flex items-center gap-1.5">
                    {b.bettorName} → {racer?.name}
                    <span
                      className="font-mono px-1 rounded"
                      style={{
                        background: isWin ? "var(--highlight)" : "var(--paper)",
                        border: "1px solid var(--ink)",
                        fontSize: "10px",
                      }}
                    >
                      {isWin ? "WIN" : "PLACE"}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 font-mono">
                    {b.amount.toFixed(2)}
                    {bettingOpen && (
                      <button onClick={() => removeBet(b.id)} aria-label="Cancel this bet">
                        <X size={12} />
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {!bettingOpen && status === "racing" && (
        <p className="text-center text-xs" style={{ color: "var(--yellow)" }}>
          Betting is locked — the race is on.
        </p>
      )}
      </>
      )}
    </div>
  );
}

function MoveControls({ racer, others, trackLength, moveRacer, setPositionDirect }) {
  const [goValue, setGoValue] = useState("");

  const submitGo = () => {
    if (goValue === "") return;
    const target = parseInt(goValue, 10);
    if (Number.isNaN(target)) return;
    setPositionDirect(racer.id, target);
    setGoValue("");
  };

  // Racers not yet finished, sorted by board position (leader first), so the
  // picker reads like the field ahead/behind this racer.
  const targetable = [...others]
    .filter((o) => !o.finished)
    .sort((a, b) => b.position - a.position);

  return (
    <div className="px-2.5 pb-2.5 space-y-2">
      {/* Step buttons */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => moveRacer(racer.id, -1)}
          className="rounded flex items-center justify-center"
          style={{ background: "var(--highlight)", minWidth: 48, minHeight: 48 }}
          aria-label={`Move ${racer.name} back 1 space`}
        >
          <Minus size={16} />
        </button>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <button
            key={n}
            onClick={() => moveRacer(racer.id, n)}
            className="rounded text-sm font-mono font-bold flex items-center justify-center"
            style={{ background: "var(--green)", color: "var(--paper2)", minWidth: 48, minHeight: 48 }}
          >
            +{n}
          </button>
        ))}
      </div>

      {/* Go to an exact space */}
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-xs shrink-0" style={{ color: "var(--muted)" }}>
          Go to space
        </span>
        <input
          type="number"
          min="0"
          max={trackLength}
          inputMode="numeric"
          value={goValue}
          onChange={(e) => setGoValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitGo();
          }}
          placeholder={`0–${trackLength}`}
          className="flex-1 px-2 rounded border text-sm"
          style={{ borderColor: "var(--ink)", background: "var(--paper)", minHeight: 48, minWidth: 60 }}
        />
        <button
          onClick={submitGo}
          disabled={goValue === ""}
          className="rounded px-3 text-sm font-bold disabled:opacity-40"
          style={{ background: "var(--yellow)", color: "var(--ink)", border: "2px solid var(--ink)", minHeight: 48 }}
        >
          Go
        </button>
      </div>

      {/* Move to another racer's space (for relational abilities) */}
      {targetable.length > 0 && (
        <div>
          <p className="font-mono text-xs mb-1" style={{ color: "var(--muted)" }}>
            Move to another racer's space
          </p>
          <div className="flex flex-wrap gap-1.5">
            {targetable.map((o) => (
              <button
                key={o.id}
                onClick={() => setPositionDirect(racer.id, o.position)}
                className="flex items-center gap-1.5 px-2.5 rounded-full text-sm border"
                style={{ background: "var(--paper)", borderColor: "var(--ink)", minHeight: 48 }}
                aria-label={`Move ${racer.name} to ${o.name}'s space (${o.position})`}
              >
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: o.color }} />
                {o.name}
                <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                  {o.position}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// "Resolve in order" reminder for the mid-turn pile-up of effects. The order
// (track space, then the mover's ability, then everyone else clockwise) comes
// from the Meeples Corner strategy guide. "Clockwise" follows roster order —
// the same rotation the Next turn button uses — since the app doesn't know
// real seating; tap a racer to correct whose turn it is.
function ResolutionOrder({ racers, activeRacerId }) {
  const [open, setOpen] = usePersistentFlag("pref-resolution-open", true);
  const idx = racers.findIndex((r) => r.id === activeRacerId);
  if (idx === -1) return null;
  const active = racers[idx];
  const others = [...racers.slice(idx + 1), ...racers.slice(0, idx)];

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-2 px-3 text-left"
        style={{ minHeight: 48 }}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Sparkles size={16} color="var(--red)" className="shrink-0" />
          <span className="font-display font-bold text-base" style={{ color: "var(--ink)" }}>
            Resolve in order
          </span>
        </span>
        <span className="font-mono text-xs shrink-0" style={{ color: "var(--muted)" }}>
          {open ? "▲ hide" : "▼ show"}
        </span>
      </button>

      {!open && (
        <p className="px-3 pb-3 -mt-1 text-xs truncate" style={{ color: "var(--muted)" }}>
          Space → {active.name} → {others.map((o) => o.name).join(", ") || "—"}
        </p>
      )}

      {open && (
        <div className="px-3 pb-3">
          <ol className="space-y-2">
            <li className="flex items-start gap-2.5">
              <span className="font-mono text-xs font-bold w-5 h-5 shrink-0 rounded-full flex items-center justify-center" style={{ background: "var(--ink)", color: "var(--paper2)", minWidth: 0, minHeight: 0 }}>1</span>
              <div>
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Track space</p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  Anything on the space {active.name} landed on goes first.
                </p>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-mono text-xs font-bold w-5 h-5 shrink-0 rounded-full flex items-center justify-center" style={{ background: "var(--ink)", color: "var(--paper2)", minWidth: 0, minHeight: 0 }}>2</span>
              <div>
                <p className="text-sm font-medium flex items-center gap-1.5" style={{ color: "var(--ink)" }}>
                  <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: active.color }} />
                  {active.name}'s own ability
                </p>
                <p className="text-xs" style={{ color: "var(--muted)" }}>The mover's power resolves next.</p>
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="font-mono text-xs font-bold w-5 h-5 shrink-0 rounded-full flex items-center justify-center" style={{ background: "var(--ink)", color: "var(--paper2)", minWidth: 0, minHeight: 0 }}>3</span>
              <div className="min-w-0">
                <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>Everyone else, clockwise</p>
                <div className="flex flex-wrap items-center gap-1 mt-1">
                  {others.length === 0 && (
                    <span className="text-xs" style={{ color: "var(--muted)" }}>No other racers.</span>
                  )}
                  {others.map((o, i) => (
                    <React.Fragment key={o.id}>
                      {i > 0 && <span className="text-xs" style={{ color: "var(--muted)" }} aria-hidden="true">→</span>}
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                        style={{
                          background: "var(--paper)",
                          border: "1.5px solid var(--ink)",
                          opacity: o.finished ? 0.55 : 1,
                        }}
                      >
                        <span className="w-2 h-2 rounded-full inline-block" style={{ background: o.color }} />
                        {o.name}
                        {o.finished && <span aria-label="finished">🏁</span>}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </li>
          </ol>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            Order per the Meeples Corner strategy guide — check the rulebook for tricky timing.
          </p>
        </div>
      )}
    </Card>
  );
}

function TrackTab({
  racers,
  trackLength,
  status,
  moveRacer,
  setPositionDirect,
  turnLog,
  endRaceNow,
  finishOrder,
  resetRace,
  savedThisRace,
  moveHistory,
  undoLastMove,
  gameSession,
  activeRacerId,
  setActiveRacer,
  advanceTurn,
  turnHasMoved,
  onboardingSeen = {},
  dismissOnboarding = () => {},
}) {
  const [expandedId, setExpandedId] = useState(null);
  const isFinalRace = !!gameSession && gameSession.raceNumber >= gameSession.totalRaces;

  // Auto-expand whoever's turn it is, whenever that changes (race start,
  // "Next turn", or the active racer finishing mid-move).
  useEffect(() => {
    if (activeRacerId) setExpandedId(activeRacerId);
  }, [activeRacerId]);

  // Sorted before the early return below so the hooks that depend on the
  // order always run in the same sequence.
  const sorted = [...racers].sort((a, b) => b.position - a.position);
  const orderKey = sorted.map((r) => r.id).join(",");

  // Rank-change cues. Each time the order changes mid-race: (1) rows slide
  // from their old spot to the new one (FLIP — measured with offsetTop so an
  // in-flight transform never skews the numbers), and (2) racers who moved
  // up/down get a ▲/▼ for a couple of seconds. Expanding or collapsing a
  // row changes heights but not the order, so it never triggers either.
  const rowRefs = useRef({});
  const prevTops = useRef({});
  const prevRanks = useRef(null);
  const prevOrderKey = useRef(null);
  const flashTimer = useRef(null);
  const [rankFlash, setRankFlash] = useState({});

  useLayoutEffect(() => {
    const tops = {};
    Object.entries(rowRefs.current).forEach(([id, el]) => {
      if (el) tops[id] = el.offsetTop;
    });
    const ranks = {};
    sorted.forEach((r, i) => {
      ranks[r.id] = i;
    });

    const orderChanged = prevOrderKey.current !== null && prevOrderKey.current !== orderKey;
    if (orderChanged && status === "racing") {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!reduced) {
        Object.entries(tops).forEach(([id, top]) => {
          const el = rowRefs.current[id];
          const old = prevTops.current[id];
          if (el && old != null && old !== top) {
            el.style.transition = "none";
            el.style.transform = `translateY(${old - top}px)`;
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                el.style.transition = "transform 0.35s cubic-bezier(0.2, 0.8, 0.2, 1)";
                el.style.transform = "";
              })
            );
          }
        });
      }

      if (prevRanks.current) {
        const flash = {};
        Object.keys(ranks).forEach((id) => {
          const before = prevRanks.current[id];
          if (before == null) return;
          if (ranks[id] < before) flash[id] = "up";
          else if (ranks[id] > before) flash[id] = "down";
        });
        if (Object.keys(flash).length > 0) {
          setRankFlash(flash);
          clearTimeout(flashTimer.current);
          flashTimer.current = setTimeout(() => setRankFlash({}), 2500);
        }
      }
    }

    prevTops.current = tops;
    prevRanks.current = ranks;
    prevOrderKey.current = orderKey;
  });

  useEffect(() => () => clearTimeout(flashTimer.current), []);

  if (status === "setup") {
    return (
      <Card>
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          Start the race from the Racers tab to begin tracking positions.
        </p>
      </Card>
    );
  }

  // Gap to whoever is currently ahead. Finished racers get their 1st/2nd badge
  // instead, and nothing shows once the race is over.
  const leaderPos = sorted.length > 0 ? sorted[0].position : 0;
  const leaderCount = sorted.filter((r) => r.position === leaderPos).length;

  return (
    <div>
      {status === "racing" && (
        <OnboardingBanner id="resolutionTip" seen={onboardingSeen} dismiss={dismissOnboarding}>
          Tip: after each move, resolve effects in order — the track space, then the mover's ability,
          then everyone else's, clockwise. The "Resolve in order" panel below keeps it handy.
        </OnboardingBanner>
      )}
      <Card className="!p-2">
        {sorted.map((r, i) => {
          const place = finishOrder.indexOf(r.id);
          const isOpen = expandedId === r.id;
          const canMove = status === "racing" && !r.finished;
          const isActive = canMove && r.id === activeRacerId;
          const gapLabel =
            status !== "racing" || r.finished
              ? null
              : r.position === leaderPos
              ? leaderCount > 1
                ? "tied lead"
                : "lead"
              : `−${leaderPos - r.position}`;
          const flash = rankFlash[r.id];
          return (
            <div
              key={r.id}
              ref={(el) => {
                rowRefs.current[r.id] = el;
              }}
              className="rounded-lg mb-1.5 last:mb-0 overflow-hidden"
              style={{
                background: "var(--paper)",
                border: isActive ? "2.5px solid var(--red)" : "2.5px solid transparent",
              }}
            >
              <button
                onClick={() => {
                  if (!canMove) return;
                  setExpandedId(isOpen ? null : r.id);
                  setActiveRacer(r.id);
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2.5 text-left"
                style={{ minHeight: 48 }}
              >
                <span
                  className="font-mono text-xs font-bold w-4 text-center shrink-0"
                  style={{ color: "var(--red)" }}
                >
                  {i + 1}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
                  style={{ background: r.color }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {isActive && <span aria-hidden="true">🎲</span>}
                    <span className="font-display font-bold text-sm truncate">{r.name}</span>
                    {r.player && (
                      <span className="text-xs truncate" style={{ color: "var(--muted)" }}>
                        {r.player}
                      </span>
                    )}
                    {isActive && (
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: "var(--red)", color: "var(--paper2)" }}
                      >
                        Their turn
                      </span>
                    )}
                    {r.finished && (
                      <span
                        className="font-mono text-xs px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: "var(--yellow)", color: "var(--ink)" }}
                      >
                        {place === 0 ? "1st" : "2nd"}
                      </span>
                    )}
                    {flash && (
                      <span
                        className="rank-pop font-mono text-xs font-bold shrink-0"
                        aria-label={flash === "up" ? "moved up" : "moved down"}
                        style={{ color: flash === "up" ? "var(--green)" : "var(--red)" }}
                      >
                        {flash === "up" ? "▲" : "▼"}
                      </span>
                    )}
                  </div>
                  <div
                    className="relative h-1.5 rounded-full mt-1 overflow-hidden"
                    style={{ background: "var(--highlight)" }}
                  >
                    <div
                      className="absolute top-0 left-0 h-full rounded-full transition-all"
                      style={{ width: `${(r.position / trackLength) * 100}%`, background: r.color }}
                    />
                  </div>
                </div>
                <span className="flex flex-col items-end shrink-0">
                  <span className="font-mono text-xs font-semibold" style={{ color: "var(--red)" }}>
                    {r.position}/{trackLength}
                  </span>
                  {gapLabel && (
                    <span
                      className="font-mono font-semibold"
                      style={{
                        fontSize: 10,
                        color: gapLabel.startsWith("−") ? "var(--muted)" : "var(--mutedGreen)",
                      }}
                    >
                      {gapLabel}
                    </span>
                  )}
                </span>
              </button>

              {isOpen && canMove && (
                <MoveControls
                  racer={r}
                  others={racers.filter((o) => o.id !== r.id)}
                  trackLength={trackLength}
                  moveRacer={moveRacer}
                  setPositionDirect={setPositionDirect}
                />
              )}
            </div>
          );
        })}
      </Card>

      {status === "racing" && <ResolutionOrder racers={racers} activeRacerId={activeRacerId} />}

      {moveHistory.length > 0 &&
        !savedThisRace &&
        (status === "racing" || moveHistory[0].racesJustEnded) && (
        <button
          onClick={undoLastMove}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium mb-3"
          style={{ background: "var(--paper)", color: "var(--ink)", border: "2px solid var(--ink)" }}
        >
          <RotateCcw size={15} /> Undo: {moveHistory[0].racerName}{" "}
          {moveHistory[0].delta >= 0 ? `+${moveHistory[0].delta}` : moveHistory[0].delta}
        </button>
      )}

      <div className="sticky bottom-3 z-20">
        {status === "racing" && activeRacerId && (
          <button
            onClick={advanceTurn}
            className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-lg text-base font-bold mb-2 shadow-lg ${
              turnHasMoved ? "next-turn-ready" : ""
            }`}
            style={{
              background: "var(--red)",
              color: "var(--paper2)",
              border: "3px solid var(--ink)",
              boxShadow: "5px 5px 0px var(--ink)",
            }}
          >
            {turnHasMoved ? "✓ Next turn →" : "Next turn →"}
          </button>
        )}
        {status === "racing" && (
          <ConfirmButton
            onConfirm={endRaceNow}
            armedLabel="Tap again to end the race now"
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-medium text-sm mb-4 shadow-lg"
            style={{ background: "var(--red)", color: "var(--paper2)", border: "3px solid var(--ink)", boxShadow: "5px 5px 0px var(--ink)" }}
          >
            <ChevronRight size={16} /> End race &amp; settle bets
          </ConfirmButton>
        )}
        {status === "finished" && !savedThisRace && (
          <>
            <p className="text-center text-xs font-mono mb-1.5" style={{ color: "var(--onBg)" }}>
              This race hasn't been saved to history yet.
            </p>
            <ConfirmButton
              onConfirm={resetRace}
              armedLabel="Tap again to discard this result"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-medium text-sm mb-4 shadow-lg"
              style={{ background: "var(--yellow)", color: "var(--ink)", border: "3px solid var(--ink)", boxShadow: "5px 5px 0px var(--ink)" }}
            >
              <RotateCcw size={16} /> {isFinalRace ? "Finish game" : "Edit roster for next race"}
            </ConfirmButton>
          </>
        )}
        {status === "finished" && savedThisRace && (
          <button
            onClick={resetRace}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-medium text-sm mb-4 shadow-lg"
            style={{ background: "var(--yellow)", color: "var(--ink)", border: "3px solid var(--ink)", boxShadow: "5px 5px 0px var(--ink)" }}
          >
            <RotateCcw size={16} /> {isFinalRace ? "Finish game" : "Edit roster for next race"}
          </button>
        )}
      </div>

      {turnLog.length > 0 && (
        <Card>
          <SectionTitle icon={Clock}>Move log</SectionTitle>
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {turnLog.map((t) => (
              <div key={t.id} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full inline-block" style={{ background: t.color }} />
                <span className="font-medium">{t.racerName}</span>
                <span className="font-mono" style={{ color: t.delta >= 0 ? "var(--green)" : "var(--red)" }}>
                  {t.delta >= 0 ? `+${t.delta}` : t.delta}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// Pip layouts for each die face (3x3 grid, 1 = pip present).
const PIP_LAYOUTS = {
  1: [0, 0, 0, 0, 1, 0, 0, 0, 0],
  2: [1, 0, 0, 0, 0, 0, 0, 0, 1],
  3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  4: [1, 0, 1, 0, 0, 0, 1, 0, 1],
  5: [1, 0, 1, 0, 1, 0, 1, 0, 1],
  6: [1, 0, 1, 1, 0, 1, 1, 0, 1],
};

// `size` defaults to the Dice tab's 96px; the draft roll-off uses a smaller die.
// `className` lets a caller add an animation class (dice-shake / dice-land).
function DieFace({ value, rolling, color, size = 96, className = "" }) {
  const small = size < 64;
  return (
    <div
      className={`${small ? "rounded-xl" : "rounded-2xl"} grid grid-cols-3 grid-rows-3 gap-0.5 ${
        rolling ? "dice-tumble" : ""
      } ${className}`}
      style={{
        width: size,
        height: size,
        padding: Math.round(size * 0.125),
        background: "var(--paper2)",
        border: small ? "2.5px solid var(--ink)" : "3px solid var(--ink)",
        boxShadow: small ? "3px 3px 0px var(--ink)" : "4px 4px 0px var(--ink)",
      }}
    >
      {(PIP_LAYOUTS[value] || PIP_LAYOUTS[1]).map((on, i) => (
        <div key={i} className="flex items-center justify-center">
          {on ? (
            <span
              className="rounded-full"
              style={{
                width: Math.round(size / 6),
                height: Math.round(size / 6),
                background: color || "var(--ink)",
              }}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DiceTab() {
  const [dice, setDice] = useState([1, 1]);
  const [displayDice, setDisplayDice] = useState([1, 1]);
  const [rolled, setRolled] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [excludeDoubles, setExcludeDoubles] = useState(false);
  const [history, setHistory] = useState([]);
  const timeoutRef = useRef(null);
  const tumbleRef = useRef(null);

  useEffect(
    () => () => {
      clearTimeout(timeoutRef.current);
      clearInterval(tumbleRef.current);
    },
    []
  );

  const doRoll = () => {
    setRolling(true);
    setRolled(true);
    clearTimeout(timeoutRef.current);
    clearInterval(tumbleRef.current);
    // Cosmetic-only: cycle random faces while it "tumbles" — the real,
    // fairness-critical result still comes from rollDice() below, once.
    tumbleRef.current = setInterval(() => {
      setDisplayDice([1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)]);
    }, 80);
    timeoutRef.current = setTimeout(() => {
      clearInterval(tumbleRef.current);
      const result = rollDice(excludeDoubles);
      setDice(result);
      setDisplayDice(result);
      setRolling(false);
      setHistory((h) => [{ id: uid(), dice: result }, ...h].slice(0, 12));
    }, 450);
  };

  const isDouble = rolled && !rolling && dice[0] === dice[1];
  const total = dice[0] + dice[1];
  const shown = rolling ? displayDice : dice;

  return (
    <div>
      <Card>
        <div className="flex items-center justify-center gap-4 py-4">
          <DieFace value={shown[0]} rolling={rolling} color="var(--red)" />
          <DieFace value={shown[1]} rolling={rolling} color="var(--purple)" />
        </div>
        <div className="text-center" style={{ minHeight: 24 }}>
          {rolled && !rolling && (
            <p className="font-mono text-sm" style={{ color: "var(--muted)" }}>
              Total {total}
              {isDouble && (
                <span className="font-bold" style={{ color: "var(--red)" }}>
                  {"  ·  DOUBLES!"}
                </span>
              )}
            </p>
          )}
        </div>
        <button
          onClick={doRoll}
          disabled={rolling}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-lg font-display font-bold text-base mt-2 disabled:opacity-60"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "3px solid var(--ink)", boxShadow: "5px 5px 0px var(--ink)" }}
        >
          <Dices size={20} /> {rolled ? "Roll again" : "Roll dice"}
        </button>
      </Card>

      <Card>
        <label className="flex items-center gap-3 cursor-pointer">
          <SwitchButton
            checked={excludeDoubles}
            onChange={(v) => setExcludeDoubles(v)}
            label="Exclude doubles"
          />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
              Exclude doubles
            </p>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Re-rolls until the two dice differ — the "match start" rule for opening moves.
            </p>
          </div>
        </label>
      </Card>

      {history.length > 0 && (
        <Card>
          <SectionTitle icon={Clock}>Recent rolls</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {history.map((h) => (
              <span
                key={h.id}
                className="font-mono text-sm px-2 py-1 rounded"
                style={{ background: "var(--paper)", border: "1.5px solid var(--ink)" }}
              >
                {h.dice[0]}-{h.dice[1]}
                {h.dice[0] === h.dice[1] ? " ✦" : ""}
              </span>
            ))}
          </div>
          <p className="font-mono text-xs mt-2" style={{ color: "var(--muted)" }}>
            Cryptographically fair rolls (unbiased 1–6).
          </p>
        </Card>
      )}
    </div>
  );
}

function GameCompleteScreen({ historyIndex, sessionId, onNewGame, onKeepRacing }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const loaded = [];
      for (const id of historyIndex) {
        try {
          const res = await window.storage.get(`race:${id}`, false);
          if (res) {
            const rec = JSON.parse(res.value);
            if (rec.sessionId === sessionId) loaded.push(rec);
          }
        } catch (e) {
          // skip
        }
      }
      setRecords(loaded);
      setLoading(false);
    })();
  }, [historyIndex, sessionId]);

  const standings = {};
  records.forEach((r) => {
    (r.placements || []).forEach((p) => {
      if (!p.player) return;
      standings[p.player] = (standings[p.player] || 0) + (p.points || 0);
    });
    (r.bonuses || []).forEach((b) => {
      if (!b.player) return;
      standings[b.player] = (standings[b.player] || 0) + (b.points || 0);
    });
  });
  const standingsList = Object.entries(standings).sort((a, b) => b[1] - a[1]);
  const topScore = standingsList[0]?.[1];
  const champions = standingsList.filter(([, pts]) => pts === topScore).map(([name]) => name);

  const championText =
    champions.length === 0
      ? null
      : champions.length === 1
      ? `${champions[0]} wins!`
      : champions.length === 2
      ? `${champions[0]} & ${champions[1]} tie — celebrate together!`
      : `${champions.slice(0, -1).join(", ")}, & ${champions[champions.length - 1]} tie — celebrate together!`;

  return (
    <div>
      <Confetti />
      <Card>
        <div className="text-center winner-pop">
          <Trophy size={44} color="var(--yellow)" className="mx-auto mb-2 trophy-glow" />
          <p className="font-mono text-xs uppercase tracking-widest" style={{ color: "var(--red)" }}>
            Game complete
          </p>
          {loading ? (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              Tallying the final scores…
            </p>
          ) : championText ? (
            <p className="font-display font-bold text-3xl" style={{ color: "var(--ink)" }}>
              {championText}
            </p>
          ) : (
            <p className="text-sm mt-2" style={{ color: "var(--muted)" }}>
              No scored races were saved this game.
            </p>
          )}
        </div>
      </Card>

      {standingsList.length > 0 && (
        <Card>
          <SectionTitle icon={Trophy}>Final standings</SectionTitle>
          <div className="space-y-1">
            {standingsList.map(([player, pts], i) => {
              // Dense rank by score, not row index, so tied scores share a medal.
              const rank = standingsList.findIndex(([, p]) => p === pts);
              return (
                <div
                  key={player}
                  className="flex items-center justify-between text-sm px-2 py-1.5 rounded"
                  style={{ background: rank === 0 ? "var(--highlight)" : "var(--paper)" }}
                >
                  <span className="font-medium">
                    {rank === 0 ? "🥇 " : rank === 1 ? "🥈 " : rank === 2 ? "🥉 " : ""}
                    {player}
                  </span>
                  <span className="font-mono font-semibold" style={{ color: "var(--red)" }}>
                    {pts}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {records.length} of 4 races from this game were saved to history.
          </p>
        </Card>
      )}

      <Card>
        <button
          onClick={onNewGame}
          className="w-full py-3 rounded-lg text-sm font-bold mb-2"
          style={{ background: "var(--red)", color: "var(--paper2)", border: "2.5px solid var(--ink)" }}
        >
          Start a new game
        </button>
        <button
          onClick={onKeepRacing}
          className="w-full py-2.5 rounded-lg text-sm font-medium"
          style={{ background: "var(--paper)", color: "var(--ink)", border: "1.5px solid var(--ink)" }}
        >
          Keep racing casually (no more race counter)
        </button>
      </Card>
    </div>
  );
}

function CareerStatsCard({ records }) {
  const [expanded, setExpanded] = useState(false);
  const stats = computeCareerStats(records);
  const topRacers = stats.racerList.filter((r) => r.entered >= 1).slice(0, 5);
  const topBettors = stats.bettorList.slice(0, 5);

  return (
    <Card>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between"
      >
        <SectionTitle icon={Trophy}>Career stats</SectionTitle>
        <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
          {expanded ? "▲" : "▼"} {stats.totalRaces} races
        </span>
      </button>
      {expanded && (
        <div className="mt-2 space-y-4">
          {stats.longestStreak && stats.longestStreak.length > 1 && (
            <div>
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "var(--muted)" }}>
                Longest win streak
              </p>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                {stats.longestStreak.name} — {stats.longestStreak.length} races in a row
              </p>
            </div>
          )}

          {stats.biggestPayout && (
            <div>
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "var(--muted)" }}>
                Biggest single payout
              </p>
              <p className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                {stats.biggestPayout.name} won {stats.biggestPayout.payout.toFixed(2)} on{" "}
                {new Date(stats.biggestPayout.date).toLocaleDateString()}
              </p>
            </div>
          )}

          {topRacers.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "var(--muted)" }}>
                Racer win rates
              </p>
              <div className="space-y-1">
                {topRacers.map((r) => (
                  <div key={r.name} className="flex items-center justify-between text-sm">
                    <span>{r.name}</span>
                    <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
                      {r.wins}/{r.entered} · {Math.round(r.winRate * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {topBettors.length > 0 && (
            <div>
              <p className="text-xs font-mono uppercase mb-1" style={{ color: "var(--muted)" }}>
                All-time bettor leaderboard
              </p>
              <div className="space-y-1">
                {topBettors.map((b) => (
                  <div key={b.name} className="flex items-center justify-between text-sm">
                    <span>{b.name}</span>
                    <span
                      className="font-mono text-xs font-semibold"
                      style={{ color: b.net >= 0 ? "var(--green)" : "var(--red)" }}
                    >
                      {b.net >= 0 ? "+" : ""}
                      {b.net.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function HistoryTab({ historyIndex, setHistoryIndex, activeSessionId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [standingsScope, setStandingsScope] = useState(activeSessionId ? "session" : "all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const loaded = [];
      for (const id of historyIndex) {
        try {
          const res = await window.storage.get(`race:${id}`, false);
          if (res) loaded.push(JSON.parse(res.value));
        } catch (e) {
          // skip
        }
      }
      setRecords(loaded);
      setLoading(false);
    })();
  }, [historyIndex]);

  const deleteRecord = async (id) => {
    const next = historyIndex.filter((x) => x !== id);
    setHistoryIndex(next);
    setRecords((prev) => prev.filter((r) => r.id !== id));
    try {
      await window.storage.set("history-index", JSON.stringify(next), false);
      await window.storage.delete(`race:${id}`, false);
    } catch (e) {
      // best effort
    }
  };

  if (loading) {
    return (
      <Card>
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          Loading history…
        </p>
      </Card>
    );
  }

  if (records.length === 0) {
    return (
      <Card>
        <p className="text-sm text-center py-6" style={{ color: "var(--muted)" }}>
          No saved races yet. Finish a race and save it to build a history here.
        </p>
      </Card>
    );
  }

  const scopedRecords =
    standingsScope === "session" && activeSessionId
      ? records.filter((r) => r.sessionId === activeSessionId)
      : records;

  const standings = {};
  scopedRecords.forEach((r) => {
    (r.placements || []).forEach((p) => {
      if (!p.player) return;
      standings[p.player] = (standings[p.player] || 0) + (p.points || 0);
    });
    (r.bonuses || []).forEach((b) => {
      if (!b.player) return;
      standings[b.player] = (standings[b.player] || 0) + (b.points || 0);
    });
  });
  const standingsList = Object.entries(standings).sort((a, b) => b[1] - a[1]);

  return (
    <div>
      {standingsList.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <SectionTitle icon={Trophy}>Standings</SectionTitle>
            {activeSessionId && (
              <div
                className="inline-flex rounded-full p-0.5 gap-0.5"
                style={{ background: "var(--paper)", border: "1.5px solid var(--ink)" }}
              >
                {[
                  ["session", "This game"],
                  ["all", "All-time"],
                ].map(([id, lbl]) => (
                  <button
                    key={id}
                    onClick={() => setStandingsScope(id)}
                    className="px-2.5 py-1 rounded-full text-xs font-mono font-semibold"
                    style={{
                      background: standingsScope === id ? "var(--red)" : "transparent",
                      color: standingsScope === id ? "var(--paper2)" : "var(--muted)",
                    }}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            {standingsScope === "session" && activeSessionId
              ? "Total gold/silver chip points across this game's saved races."
              : "Total gold/silver chip points across every saved race — your running tournament score."}
          </p>
          <div className="space-y-1">
            {standingsList.map(([player, pts], i) => (
              <div
                key={player}
                className="flex items-center justify-between text-sm px-2 py-1.5 rounded"
                style={{ background: i === 0 ? "var(--highlight)" : "var(--paper)" }}
              >
                <span className="font-medium">
                  {i === 0 ? "🥇 " : i === 1 ? "🥈 " : i === 2 ? "🥉 " : ""}
                  {player}
                </span>
                <span className="font-mono font-semibold" style={{ color: "var(--red)" }}>
                  {pts}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
      <CareerStatsCard records={records} />
      {records.map((r) => (
        <Card key={r.id}>
          <div className="flex items-center justify-between mb-1">
            <span className="font-display font-bold text-base">{r.winner}</span>
            <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>
              {new Date(r.date).toLocaleDateString()}
            </span>
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--muted)" }}>
            {r.finishOrder.join(" → ")}
          </p>
          {(r.placements || []).some((p) => p.player) && (
            <p className="text-xs mb-2 font-mono" style={{ color: "var(--mutedGreen)" }}>
              {r.placements
                .filter((p) => p.player)
                .map((p) => `${p.player} +${p.points}`)
                .join(" · ")}
            </p>
          )}
          {r.results.length > 0 && (
            <div className="space-y-0.5 mb-2">
              {r.results.map((res, i) => (
                <div key={i} className="flex justify-between text-xs font-mono">
                  <span>{res.name}</span>
                  <span style={{ color: res.net >= 0 ? "var(--green)" : "var(--red)" }}>
                    {res.net >= 0 ? "+" : ""}
                    {res.net.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <ConfirmButton
            onConfirm={() => deleteRecord(r.id)}
            armedLabel="Tap again to delete this race"
            className="text-xs font-mono px-2 py-1 rounded"
            style={{ color: "var(--red)", background: "transparent" }}
          >
            Delete this race
          </ConfirmButton>
        </Card>
      ))}
    </div>
  );
}
