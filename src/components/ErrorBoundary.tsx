import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode; // الواجهة البديلة التي ستظهر عند حدوث الخطأ
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  // تحديث الحالة ليتم عرض الواجهة البديلة في الرندرة القادمة
  public static getDerivedStateFromError(_: Error): State {
    return { hasError: true };
  }

  // يمكنك هنا إرسال تقرير الخطأ إلى خادم خارجي (مثل Sentry)
  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("خطأ غير متوقع:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;