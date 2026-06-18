import { useEffect, useState } from 'react';
import ExitGameOverlay from './ExitGameOverlay';
import '../styles/ChapterMap.css';

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
  const [gameOpen, setGameOpen] = useState(false);

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await fetch(`${apiBase}/learner/${learnerId}/chapter/${chapterId}`);
        if (!res.ok) throw new Error(`API ${res.status}: could not load chapter`);
        const data = await res.json();
        if (!data.nodes?.length) throw new Error('No concepts returned for this chapter');
        setChapter(data.chapter);
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
  const showGameUnlock = chapterId === 'cbse10:maths:jemh101';

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
                      <div className="dot">{node.status === 'passed' ? '' : node.status === 'coming_soon' ? '...' : node.order}</div>
                      <div className="nm">{node.title.split('·')[0].trim()}</div>
                    </div>
                    {showGameUnlock && index === 0 && (
                        <button
                          type="button"
                          className="game-unlock"
                          onClick={() => setGameOpen(true)}
                          title="Open eXit"
                        >
                        <span className="game-unlock-badge">game unlocked</span>
                        <span className="game-unlock-title">eXit</span>
                      </button>
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

      {gameOpen && <ExitGameOverlay onClose={() => setGameOpen(false)} />}
    </div>
  );
}
