import { RootCircuit } from "tscircuit";
import "./extend-expect-circuit-snapshot";

export const getTestFixture = () => {
  const circuit = new RootCircuit();

  return {
    circuit,
    project: circuit,
  };
};
