export default function Flash({
  error,
  ok,
  released,
}: {
  error?: string;
  ok?: string;
  released?: string;
}) {
  return (
    <>
      {error && <div className="flash error">{error}</div>}
      {ok && <div className="flash ok">{ok}</div>}
      {released && (
        <div className="flash info">
          <strong>Released by this confirmation — let these agents know:</strong> {released}
        </div>
      )}
    </>
  );
}
