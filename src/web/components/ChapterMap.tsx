import { useEffect, useState } from 'react';
import GameOverlay from './GameOverlay';
import '../styles/ChapterMap.css';

// Short cult games that unlock one-per-node on the first few concepts. Each is a
// self-contained static page under /public/gameN/ (loaded in an iframe overlay).
// Every one is playable in well under 10 minutes. Order = node order.
const GAMES = [
  { title: 'eXit', src: '/game1/exit.html' }, // bespoke terminal escape (ours)
  { title: 'Execution', src: '/_ruffle/play.html?swf=/swf/execution.swf' }, // Venbrux — original Flash via Ruffle
  { title: 'A Dark Room', src: '/game3/index.html' }, // Doublespeak Games — open source
  { title: 'One Chance', src: '/_ruffle/play.html?swf=/swf/onechance.swf' }, // AwkwardSilence — original Flash via Ruffle
  { title: 'Passage', src: '/game5/index.html' }, // Rohrer — public-domain web build (MoMA)
  { title: 'WarGames', src: '/games/gtw/index.html' }, // GTW — open-source WOPR (ghelleks)
  { title: 'The House Abandon', src: '/game7/house.html' }, // homage — original is proprietary
  { title: 'Every Day the Same Dream', src: '/_ruffle/play.html?swf=/swf/sameday.swf' }, // Molleindustria — original Flash via Ruffle
  { title: 'Today I Die', src: '/_ruffle/play.html?swf=/swf/todayidie.swf' }, // Benmergui — original Flash via Ruffle
  { title: 'I Wish I Were the Moon', src: '/game8/moon.html' }, // homage — Flash is Flex, won't embed
  { title: 'Loneliness', src: '/games/loneliness/index.html' }, // Magnuson — official HTML5 port
  { title: 'Loved', src: '/_ruffle/play.html?swf=/swf/loved.swf' }, // Ocias — original Flash via Ruffle
  { title: 'We Become What We Behold', src: '/games/wbwwb/index.html' }, // Nicky Case — CC0
  { title: 'It is as if you were doing work', src: '/games/itisasif/index.html' }, // Pippin Barr (open source)
  { title: 'Snakisms', src: '/games/snakisms/index.html' }, // Pippin Barr — 21 philosophical snakes
  { title: 'A Series of Gunshots', src: '/games/gunshots/index.html' }, // Pippin Barr (open source)
  { title: 'You Are Jeff Bezos', src: '/games/jeffbezos/index.html' }, // Kris Ligman — Twine
  { title: 'A Studio Above a Bookstore', src: '/games/studio/index.html' }, // Anna Anthropy — Bitsy
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
              <span className="l-open">open</span>
              <span className="l-cur">you're here</span>
              <span className="l-lock">locked</span>
            </div>
            <div className="hint">Green = unlocked (the glowing one is where you are now), locked faded = still locked. Open and done concepts are clickable.</div>
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
