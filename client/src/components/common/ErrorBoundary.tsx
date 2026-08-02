import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled UI error', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-bg-surface p-8 text-center">
          <p className="font-display text-lg font-medium text-text-primary">Something went wrong</p>
          <p className="font-body text-sm text-text-secondary">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-row border border-border bg-bg-surface-alt px-3 py-1.5 text-sm text-text-primary hover:text-accent"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
