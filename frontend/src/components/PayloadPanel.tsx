import { useEffect } from 'react';
import { useStore } from '../state/store';
import { RemoteDataSource } from '../datasource';

const dataSource = new RemoteDataSource();

export function PayloadPanel() {
  const { sessionId, selectedRowId, payload, setPayload, setError } = useStore();

  useEffect(() => {
    if (!sessionId || selectedRowId === null) {
      setPayload(null);
      return;
    }

    let cancelled = false;

    const fetchPayload = async () => {
      try {
        const data = await dataSource.getPayload(sessionId, selectedRowId);
        if (!cancelled) {
          setPayload(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load payload');
        }
      }
    };

    fetchPayload();

    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedRowId, setPayload, setError]);

  if (selectedRowId === null) {
    return (
      <div className="payload-panel empty">
        <p>Select a message to view its payload</p>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="payload-panel loading">
        <p>Loading payload...</p>
      </div>
    );
  }

  return (
    <div className="payload-panel">
      <h3>Message Payload (Row {selectedRowId})</h3>

      {payload.semantic && (
        <div className="payload-section">
          <h4>Semantic</h4>
          <div className="payload-semantic">
            <div className="semantic-field">
              <span className="field-label">Kind:</span>
              <span className="field-value">{payload.semantic.kind}</span>
            </div>
            {payload.semantic.ceid && (
              <div className="semantic-field">
                <span className="field-label">CEID:</span>
                <span className="field-value">{payload.semantic.ceid}</span>
                {payload.semantic.ceid_name && (
                  <span className="field-note">({payload.semantic.ceid_name})</span>
                )}
              </div>
            )}
            {payload.semantic.vids && (
              <div className="semantic-field">
                <span className="field-label">VIDs:</span>
                <span className="field-value">{payload.semantic.vids.join(', ')}</span>
              </div>
            )}
            {payload.semantic.values && (
              <div className="semantic-field">
                <span className="field-label">Values:</span>
                <pre className="field-json">
                  {JSON.stringify(payload.semantic.values, null, 2)}
                </pre>
              </div>
            )}
            {payload.semantic.rcmd && (
              <div className="semantic-field">
                <span className="field-label">Remote Command:</span>
                <span className="field-value">{payload.semantic.rcmd}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {payload.secs_tree && (
        <div className="payload-section">
          <h4>SECS Tree</h4>
          <div className="payload-tree">
            <SecsTree node={payload.secs_tree} indent={0} />
          </div>
        </div>
      )}

      <details className="payload-raw">
        <summary>Raw JSON</summary>
        <pre>{JSON.stringify(payload, null, 2)}</pre>
      </details>
    </div>
  );
}

interface SecsTreeProps {
  node: any;
  indent: number;
}

function SecsTree({ node, indent }: SecsTreeProps) {
  if (!node || typeof node !== 'object') {
    return <span className="tree-value">{String(node)}</span>;
  }

  const { t, v, items } = node;
  const padding = indent * 20;

  if (t === 'L' && items) {
    return (
      <div style={{ paddingLeft: padding }}>
        <span className="tree-type">L[{items.length}]</span>
        <div className="tree-items">
          {items.map((item: any, i: number) => (
            <div key={i} className="tree-item">
              <SecsTree node={item} indent={indent + 1} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: padding }}>
      <span className="tree-type">{t}</span>
      {v !== undefined && (
        <>
          : <span className="tree-value">{String(v)}</span>
        </>
      )}
    </div>
  );
}

