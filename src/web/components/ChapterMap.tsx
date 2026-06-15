import { useEffect, useState } from 'react';
import '../styles/ChapterMap.css';

interface Node {
  id: string;
  slug: string;
  title: string;
  order: number;
  status: 'locked' | 'available' | 'passed';
}

interface ChapterMapProps {
  learnerId: string;
  exam: string;
  subject: string;
  onNodeClick: (conceptId: string) => void;
  onBack: () => void;
  apiBase: string;
}

export default function ChapterMap({
  learnerId,
  exam,
  subject,
  onNodeClick,
  onBack,
  apiBase,
}: ChapterMapProps) {
  const [chapter, setChapter] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);

  const chapterId = 'cbse10:maths:jemh101'; // Hardcoded for 3-node prototype

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await fetch(`${apiBase}/learner/${learnerId}/chapter/${chapterId}`);
        if (!res.ok) throw new Error('Failed to fetch chapter');
        const data = await res.json();
        setChapter(data.chapter);
        setNodes(data.nodes.sort((a: Node, b: Node) => a.order - b.order));
      } catch (err) {
        console.error('Error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchChapter();
  }, [learnerId, chapterId, apiBase]);

  if (loading) return <div className="chapter-map loading">Loading...</div>;

  return (
    <div className="chapter-map">
      <button className="back-btn" onClick={onBack}>← Back</button>

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
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className={`c ${node.status}`}
                  onClick={() => node.status === 'available' && onNodeClick(node.id)}
                  title={node.title}
                >
                  <div className="dot">
                    {node.status === 'passed' ? '' : node.order}
                  </div>
                  <div className="nm">{node.title.split('·')[0].trim()}</div>
                </div>
              ))}
            </div>
            <div className="legend">
              <span className="l-done">passed</span>
              <span className="l-now">open now</span>
              <span className="l-lock">locked</span>
            </div>
            <div className="hint">More than one can be open at once — you choose which to do next.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
