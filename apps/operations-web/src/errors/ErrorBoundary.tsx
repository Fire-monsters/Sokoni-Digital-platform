import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode; fallback: (error: Error, reset: () => void) => ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Dashboard render failure", error, info.componentStack);
  }
  reset = () => this.setState({ error: null });
  render() {
    return this.state.error
      ? this.props.fallback(this.state.error, this.reset)
      : this.props.children;
  }
}
