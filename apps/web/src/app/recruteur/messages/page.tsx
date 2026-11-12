import { Suspense } from "react";
import { MessagesView } from "@/components/messages-view";

// MessagesView reads the URL (useSearchParams), which needs a Suspense boundary for production builds.
export default function RecruiterMessagesPage() {
  return (
    <Suspense fallback={null}>
      <MessagesView role="RECRUITER" />
    </Suspense>
  );
}
