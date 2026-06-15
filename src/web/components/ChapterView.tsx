import { useEffect, useState } from 'react';
import '../styles/ChapterView.css';

interface Node {
  id: string;
  slug: string;
  title: string;
  role: string;
  order: number;
  status: 'locked' | 'available' | 'passed' | 'teaching' | 'awaiting_gate' | 'needs_reteach';
}

interface ChapterViewProps {
  learnerId: string;
  chapterId: string;
  onNodeClick: (conceptId: string) => void;
  apiBase: string;
}

export default function ChapterView({ learnerId, chapterId, onNodeClick, apiBase }: ChapterViewProps) {
  const [chapter, setChapter] = useState<any>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchChapter = async () => {
      try {
        const res = await fetch(`${apiBase}/learner/${learnerId}/chapter/${chapterId}`);
        if (!res.ok) throw new Error('Failed to fetch chapter');
        const data = await res.json();
        setChapter(data.chapter);
        setNodes(data.nodes);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    fetchChapter();
  }, [learnerId, chapterId, apiBase]);

  if (loading) return <div className="chapter-view loading">Loading chapter...</div>;
  if (error) return <div className="chapter-view error">Error: {error}</div>;

  const nodesByOrder = [...nodes].sort((a, b) => a.order - b.order);

  return (
    <div className="chapter-view">
      <h2>{chapter?.title}</h2>
      <p className="chapter-subtitle">Learn the concepts bottom-up, then take the exam.</p>

      <div className="node-map">
        {nodesByOrder.map((node) => (
          <div
            key={node.id}
            className={`node-card ${node.status}`}
            onClick={() => node.status === 'available' && onNodeClick(node.id)}
            title={node.title}
          >
            <div className="node-number">{node.order}</div>
            <div className="node-status-indicator" />
            <div className="node-title">{node.title}</div>
            <div className="node-role">{node.role}</div>
            <div className={`node-status-label ${node.status}`}>
              {node.status === 'available' && 'Ready'}
              {node.status === 'locked' && 'Locked'}
              {node.status === 'passed' && 'Done ✓'}
              {node.status === 'teaching' && 'In Progress'}
              {node.status === 'awaiting_gate' && 'Gate'}
              {node.status === 'needs_reteach' && 'Reteach'}
            </div>
          </div>
        ))}
      </div>

      <div className="chapter-info">
        <p>
          Pass count: {nodes.filter(n => n.status === 'passed').length} / {nodes.length}
        </p>
      </div>
    </div>
  );
}
