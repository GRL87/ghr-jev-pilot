import { Experimental_EvaluationMockModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

import { examples } from "./examples";
import { routeSubmission, submissionSchema } from "./router";

vi.mock("server-only", () => ({}));

const example = examples.contact;
const submission = example.samples[0].values;

const mockJev = (
  confidence: number | string | null | undefined,
  probability = 0.99
) => {
  const probabilities = Object.fromEntries(
    example.destinations.map((destination) => [destination.id, 0])
  );
  probabilities.billing_refunds = probability;
  probabilities.billing_invoices = 1 - probability;
  const model = new Experimental_EvaluationMockModelV4({
    doEvaluate: () =>
      Promise.resolve({
        answers: {
          destination: {
            choice: "billing_refunds",
            probabilities,
            type: "choice",
          },
        },
        providerMetadata: {
          typesafe: {
            confidence:
              confidence === undefined ? {} : { destination: confidence },
          },
        },
        warnings: [],
      }),
  });
  return { model };
};

describe("routing policy", () => {
  it.each([0.95, 0.98, 1])(
    "accepts Jev at confidence %s",
    async (confidence) => {
      const result = await routeSubmission(example, submission, {
        jev: mockJev(confidence).model,
      });
      expect(result.status).toBe("PASS");
      expect(result.model).toBe("typesafe-ai/jev");
      expect(result.destination?.id).toBe("billing_refunds");
      expect(result.reason).toBeNull();
    }
  );

  it.each([0, 0.94, 0.94999])(
    "requires an owner below the raw confidence threshold: %s",
    async (confidence) => {
      const result = await routeSubmission(example, submission, {
        jev: mockJev(confidence, 0.999).model,
      });
      expect(result.status).toBe("OWNER_REQUIRED");
      expect(result.destination).toBeNull();
      expect(result.reason).toBe("low-confidence");
      expect(result.jev?.destination).toBe("billing_refunds");
    }
  );

  it("does not substitute selected probability for confidence", async () => {
    const result = await routeSubmission(example, submission, {
      jev: mockJev(0.96, 0.7).model,
    });
    expect(result.model).toBe("typesafe-ai/jev");
    expect(result.jev?.selectedProbability).toBe(0.7);
  });

  it.each([undefined, null, "0.99", -1, 1.1, Number.NaN])(
    "requires an owner when confidence is missing or invalid: %s",
    async (confidence) => {
      const result = await routeSubmission(example, submission, {
        jev: mockJev(confidence).model,
      });
      expect(result.status).toBe("OWNER_REQUIRED");
      expect(result.reason).toBe("missing-confidence");
      expect(result.jev?.confidence).toBeNull();
    }
  );

  it("returns RETRY after a Jev failure", async () => {
    const jev = new Experimental_EvaluationMockModelV4({
      doEvaluate: () => {
        throw new Error("Unavailable");
      },
    });
    const result = await routeSubmission(example, submission, {
      jev,
    });
    expect(result.status).toBe("RETRY");
    expect(result.reason).toBe("jev-error");
    expect(result.destination).toBeNull();
    expect(result.jev).toBeNull();
  });

  it("returns FAIL for a Jev access denial", async () => {
    const jev = new Experimental_EvaluationMockModelV4({
      doEvaluate: () => {
        throw Object.assign(new Error("Jev denied"), { statusCode: 403 });
      },
    });
    const result = await routeSubmission(example, submission, { jev });
    expect(result.status).toBe("FAIL");
    expect(result.destination).toBeNull();
  });

  it("returns RETRY when the SDK rejects an invalid Jev response", async () => {
    const jev = new Experimental_EvaluationMockModelV4({
      doEvaluate: () =>
        Promise.resolve({
          answers: {
            destination: { choice: "external_inbox", type: "choice" },
          },
          providerMetadata: {
            typesafe: { confidence: { destination: 0.99 } },
          },
          warnings: [],
        }),
    });
    const result = await routeSubmission(example, submission, { jev });
    expect(result).toMatchObject({
      destination: null,
      reason: "jev-error",
      status: "RETRY",
    });
  });

  it("passes the registered state and criteria to Jev", async () => {
    const original = mockJev(0.8).model;
    const evaluateCall = vi.fn(original.doEvaluate);
    const jev = new Experimental_EvaluationMockModelV4({
      doEvaluate: evaluateCall,
    });
    const result = await routeSubmission(example, submission, { jev });
    const [[evaluation]] = evaluateCall.mock.calls;
    expect(evaluation.state).toEqual({ example: example.id, submission });
    expect(evaluation.questions.destination).toBeDefined();
    expect(result.status).toBe("OWNER_REQUIRED");
  });
});

describe("registered form validation", () => {
  it.each(Object.values(examples))(
    "accepts every sample in $title",
    (entry) => {
      for (const sample of entry.samples) {
        expect(submissionSchema(entry).safeParse(sample.values).success).toBe(
          true
        );
      }
      expect(
        new Set(entry.destinations.map((destination) => destination.id)).size
      ).toBe(entry.destinations.length);
    }
  );

  it("rejects blank, oversized, and invalid email values", () => {
    expect(
      submissionSchema(example).safeParse({
        ...submission,
        email: "invalid",
        message: " ",
        subject: "x".repeat(255),
      }).success
    ).toBe(false);
  });

  it("trims fields and drops client-supplied recipients or destinations", () => {
    const result = submissionSchema(example).parse({
      ...submission,
      destination: "billing_refunds",
      name: "  Alex  ",
      to: "attacker@example.com",
    });
    expect(result.name).toBe("Alex");
    expect(result).not.toHaveProperty("to");
    expect(result).not.toHaveProperty("destination");
  });
});
