export default function OfflinePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-900 px-6 text-gray-100">
      <section className="max-w-md rounded-lg border border-slate-700 bg-slate-900 p-6 text-center">
        <h1 className="text-xl font-semibold">You are offline</h1>
        <p className="mt-2 text-sm text-slate-300">
          Band Chat is not reachable right now. Reconnect to the internet and try again.
        </p>
      </section>
    </main>
  );
}