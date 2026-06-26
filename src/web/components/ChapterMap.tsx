import { useEffect, useState } from 'react';
import GameOverlay from './GameOverlay';
import '../styles/ChapterMap.css';

// Games unlock one-per-node as concepts are completed. All external embeds — nothing
// vendored or coded by us. Each URL is (1) header-checked (no X-Frame-Options / CSP
// frame-ancestors) AND (2) eyes-on render-verified inside the dark-overlay iframe via
// headless+GPU Chrome screenshots (2026-06-26). Action-focused: racing, shooters, runner,
// maze adventure, multiplayer tank. Dropped for blank/black frames: SWOOOP, Ink Wars
// (PlayCanvas blank), Jungle Runner/kandi-runner (frozen loader), Asteroids (black canvas).
// Order = node order, ramping from quick arcade to 3D/multiplayer.
const GAMES = [
  { title: 'HexGL', src: 'https://hexgl.bkcore.com/play/' }, // neon 3D racer (BKcore)
  { title: 'T-Rex Runner', src: 'https://wayou.github.io/t-rex-runner/' }, // endless runner (Chrome dino)
  { title: '2048', src: 'https://hczhcz.github.io/2048/' }, // number-merge puzzle
  { title: 'BlockRain', src: 'https://aerolab.github.io/blockrain.js/' }, // colourful Tetris (Aerolab)
  { title: 'Hextris', src: 'https://hextris.github.io/' }, // spinning-hexagon puzzle
  { title: 'Snake', src: 'https://ramazancetinkaya.github.io/snake-game/' }, // modern snake
  { title: 'Clumsy Bird', src: 'https://ellisonleao.github.io/clumsy-bird/' }, // bright flappy arcade
  { title: 'Astray', src: 'https://wwwtyro.github.io/Astray/' }, // 3D marble-maze adventure (wwwtyro)
  { title: 'Arena5', src: 'https://www.kevs3d.co.uk/dev/arena5/' }, // neon twin-stick shooter (Kevin Roast)
  { title: 'Master Archer', src: 'https://playcanv.as/p/JERg21J8/' }, // 3D archery action (PlayCanvas)
  { title: 'Orbital Survival', src: 'https://playcanv.as/p/3G3RnfUz/' }, // arcade wave shooter (PlayCanvas)
  { title: 'Galaxies: Combat', src: 'https://playcanv.as/p/Ikq6Uk6A/' }, // 3D space shooter (PlayCanvas)
  { title: 'TANX', src: 'https://tanx.io/' }, // online multiplayer tank battle (PlayCanvas)
];

// Each math course is its own sequential path; games map to the COURSE-WIDE node index (chapters are
// just sequential dividers) and flow across chapter boundaries via the server's nodeOffset. Gate on the
// three course subjects so games only ever appear inside a real course.
const GAME_SUBJECTS = ['cbse10:maths', 'cbse12:mathematics', 'jee:maths'];
const inGameCourse = (id: string) => GAME_SUBJECTS.some((s) => id.startsWith(s + ':'));

interface Node {
  id: string;
  slug: string;
  title: string;
  order: number;
  // 'coming_soon' = a "Learn from Scratch" node imported from the map but not yet authored.
  status: 'locked' | 'available' | 'passed' | 'coming_soon' | 'teaching' | 'awaiting_gate' | 'needs_reteach';
}

interface ChapterMapProps {
  learnerId: string;
  chapterId: string;
  onNodeClick: (conceptId: string) => void;
  onBack: () => void;
  apiBase: string;
}

export default function ChapterMap({
  learnerId,
  chapterId,
  onNodeClick,
  onBack,
  apiBase,
}: ChapterMapProps) {
  const [chapter, setChapter] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGame, setOpenGame] = useState<number | null>(null);
  const [nodeOffset, setNodeOffset] = useState(0); // course-wide index of this chapter's first node

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await fetch(`${apiBase}/learner/${learnerId}/chapter/${chapterId}`);
        if (!res.ok) throw new Error(`API ${res.status}: could not load chapter`);
        const data = await res.json();
        if (!data.nodes?.length) throw new Error('No concepts returned for this chapter');
        setChapter(data.chapter);
        setNodeOffset(data.nodeOffset ?? 0);
        setNodes(data.nodes.sort((a: Node, b: Node) => a.order - b.order));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchChapter();
  }, [learnerId, chapterId, apiBase]);

  if (loading) return <div className="chapter-map loading">Loading concepts...</div>;
  if (error) {
    return (
      <div className="chapter-map">
        <button className="back-btn" onClick={onBack}>Back</button>
        <div className="map-error">Couldn't load concepts: {error}. Is the API running on :3030?</div>
      </div>
    );
  }

  const inProgress = ['teaching', 'awaiting_gate', 'needs_reteach'];
  const isOpen = (n: Node) => n.status === 'available' || inProgress.includes(n.status);
  const current =
    nodes.find((n) => inProgress.includes(n.status)) ??
    nodes.find((n) => isOpen(n));
  // Games unlock in strict sequence: game i opens only when the contiguous run of passed nodes from the
  // start reaches it (nodes 0..i all passed). Same as "node i passed" in normal play, but robust to a
  // stale / out-of-order pass (e.g. after a chapter re-order) unlocking a game ahead of the real frontier.
  let passedPrefix = 0;
  for (const n of nodes) {
    if (n.status === 'passed') passedPrefix++;
    else break;
  }
  const showGameUnlock = inGameCourse(chapterId);

  return (
    <div className="chapter-map">
      <button className="back-btn" onClick={onBack}>Back</button>

      <div className="step">
        <div className="num">3</div>
        <div className="grow">
          <h2>Inside a chapter, concepts unlock as you go</h2>
          <p>
            Each chapter is a small map of its concepts, built bottom-up: the foundations open first, and finishing them unlocks what builds on top. Tap any open concept to start it.
          </p>

          <div className="map-wrap">
            <div className="map-title">{chapter?.title}</div>
            <div className="map">
              {nodes.map((node, index) => {
                const isCurrent = current && node.id === current.id;
                const g = nodeOffset + index; // course-wide game index (chapters flow into one sequence)
                const visual =
                  node.status === 'passed'
                    ? 'done'
                    : node.status === 'coming_soon'
                      ? 'soon'
                      : isCurrent
                        ? 'current'
                        : isOpen(node)
                          ? 'open'
                          : 'locked';
                const clickable = node.status === 'passed' || isOpen(node);
                return (
                  <div key={node.id} className="map-entry">
                    <div
                      className={`c ${visual}`}
                      onClick={() => clickable && onNodeClick(node.id)}
                      title={node.status === 'coming_soon' ? `${node.title} - coming soon` : node.title}
                    >
                      <div className="dot">{node.status === 'passed' ? '' : node.status === 'coming_soon' ? '...' : node.order + 1}</div>
                      <div className="nm">{node.title.split('·')[0].trim()}</div>
                    </div>
                    {showGameUnlock && g < GAMES.length && (
                      index < passedPrefix ? (
                        <button
                          type="button"
                          className="game-unlock"
                          onClick={() => setOpenGame(g)}
                          title={`Open ${GAMES[g].title}`}
                        >
                          <span className="game-unlock-badge">game unlocked</span>
                          <span className="game-unlock-title">{GAMES[g].title}</span>
                        </button>
                      ) : (
                        <div
                          className="game-unlock locked"
                          title={`Finish this concept to unlock ${GAMES[g].title}`}
                          aria-disabled="true"
                        >
                          <span className="game-unlock-badge">🔒 locked</span>
                          <span className="game-unlock-title">{GAMES[g].title}</span>
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            <div className="legend">
              <span className="l-done">done</span>
              <span className="l-open">to do</span>
              <span className="l-cur">you're here</span>
            </div>
            <div className="hint">Grey = not done yet, green = done (the glowing one is where you are now). Every concept is open — tap any to learn or refresh it.</div>
          </div>
        </div>
      </div>

      {openGame !== null && (
        <GameOverlay
          src={GAMES[openGame].src}
          title={GAMES[openGame].title}
          onClose={() => setOpenGame(null)}
        />
      )}
    </div>
  );
}
