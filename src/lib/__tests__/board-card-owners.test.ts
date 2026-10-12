import { describe, it, expect, vi } from "vitest";
import { setCardOwnersIn } from "@/lib/board-server";

vi.mock("@/lib/db", () => ({ db: {} }));

function makeTx(unmatched: string[] = []) {
  return {
    boardCardOwner: { deleteMany: vi.fn(), createMany: vi.fn() },
    boardCard: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ unmatchedOwnerNames: unmatched }),
      update: vi.fn(),
    },
  };
}
type Tx = Parameters<typeof setCardOwnersIn>[0];

describe("setCardOwnersIn (Part 38)", () => {
  it("deletes only owners not in the new set and inserts with skipDuplicates", async () => {
    const tx = makeTx();
    await setCardOwnersIn(tx as unknown as Tx, "c1", ["a", "b"], { a: "Janey" }, []);
    expect(tx.boardCardOwner.deleteMany).toHaveBeenCalledWith({ where: { cardId: "c1", personId: { notIn: ["a", "b"] } } });
    expect(tx.boardCardOwner.createMany).toHaveBeenCalledWith({
      data: [
        { cardId: "c1", personId: "a", rawName: "Janey" },
        { cardId: "c1", personId: "b", rawName: null },
      ],
      skipDuplicates: true,
    });
  });

  it("writes the legacy fields (first owner) and the unmatched names when given", async () => {
    const tx = makeTx();
    await setCardOwnersIn(tx as unknown as Tx, "c1", ["a", "b"], { a: "Janey" }, ["Ghost"]);
    expect(tx.boardCard.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerId: "a", rawOwnerName: "Janey", unmatchedOwnerNames: ["Ghost"] },
    });
    expect(tx.boardCard.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it("an empty set deletes all owners, skips the insert, and clears the legacy owner", async () => {
    const tx = makeTx();
    await setCardOwnersIn(tx as unknown as Tx, "c1", [], {}, []);
    expect(tx.boardCardOwner.deleteMany).toHaveBeenCalledWith({ where: { cardId: "c1", personId: { notIn: [] } } });
    expect(tx.boardCardOwner.createMany).not.toHaveBeenCalled();
    expect(tx.boardCard.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerId: null, rawOwnerName: null, unmatchedOwnerNames: [] },
    });
  });

  it("with unmatched undefined, leaves the names alone and falls back to the first for the legacy raw name", async () => {
    const tx = makeTx(["Ghost"]);
    await setCardOwnersIn(tx as unknown as Tx, "c1", [], {});
    expect(tx.boardCard.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { ownerId: null, rawOwnerName: "Ghost" },
    });
  });
});
