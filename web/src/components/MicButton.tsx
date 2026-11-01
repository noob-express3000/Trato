export function MicButton({ recording, onClick }: { recording: boolean; onClick: () => void }) {
  return (
    <button aria-label={recording ? 'Stop recording' : 'Start recording'} onClick={onClick} className={`h-16 w-16 rounded-full text-white ${recording ? 'bg-red-600' : 'bg-indigo-600'} shadow-lg`}>
      {recording ? 'Stop' : 'Mic'}
    </button>
  );
}
