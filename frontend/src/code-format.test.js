import { describe, expect, it } from "vitest";
import { formatCode } from "./code-format.js";

describe("formatCode", () => {
  it("formata 12 dígitos em 0000-0000-0000", () => {
    expect(formatCode("123456789012")).toBe("1234-5678-9012");
  });
  it("limita a 12 dígitos e ignora letras", () => {
    expect(formatCode("1a2b3c4567890123extra")).toBe("1234-5678-9012");
  });
  it("mantém grupos parciais enquanto digita", () => {
    expect(formatCode("123")).toBe("123");
    expect(formatCode("1234567")).toBe("1234-567");
  });
});
