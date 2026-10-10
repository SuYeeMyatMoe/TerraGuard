import type { Metadata } from "next";
import { CommandCenter } from "@/components/command/CommandCenter";

export const metadata: Metadata = {
  title: "Forest Command Center — TerraGuard AI",
};

export default function SimulationPage() {
  return <CommandCenter />;
}
