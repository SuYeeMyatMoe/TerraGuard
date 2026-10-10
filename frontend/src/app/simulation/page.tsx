import type { Metadata } from "next";
import { CommandCenter } from "@/components/command/CommandCenter";
import "./simulation.css";

export const metadata: Metadata = {
  title: "Forest Command Center — TerraGuard AI",
};

export default function SimulationPage() {
  return <CommandCenter />;
}
