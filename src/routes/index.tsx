import { createFileRoute } from "@tanstack/react-router";
import { HaFloor } from "@/components/ha-floor";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return <HaFloor />;
}
