import { Link } from "react-router-dom"

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto px-6 text-center py-20">
      <div className="font-mono text-xs text-neutral-500 mb-4 tracking-widest">404</div>
      <h1
        className="text-4xl md:text-5xl font-medium tracking-tight text-white mb-6"
        style={{ letterSpacing: "-0.03em" }}
      >
        Not here.{" "}
        <span className="serif-italic font-normal text-neutral-400">Try the index.</span>
      </h1>
      <p className="text-neutral-400 mb-10">
        The page you're looking for has either been moved, deleted, or never
        existed. The audit log would say "404" if you asked.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/" className="btn-accent">
          back to home →
        </Link>
        <Link to="/docs" className="btn-secondary">
          read the docs
        </Link>
      </div>
    </div>
  )
}
