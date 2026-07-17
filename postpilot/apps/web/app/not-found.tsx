import { EmptyState, LinkButton } from "@/components/ui";

export default function NotFound() {
  return <main className="center-page"><EmptyState icon="alert" title="Page not found" description="That cockpit view does not exist." action={<LinkButton href="/today" icon="today">Back to today</LinkButton>} /></main>;
}

