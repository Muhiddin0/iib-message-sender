import { ClientResponseError } from "pocketbase";
import { describe, expect, it } from "vitest";

import { hasResponseStatus, isNotFoundError } from "@/lib/repositories/helpers";

describe("repository response error helpers", () => {
  it("recognizes a PocketBase 404 response", () => {
    const error = new ClientResponseError({
      status: 404,
      response: { code: 404, message: "The requested resource wasn't found." },
    });

    expect(isNotFoundError(error)).toBe(true);
  });

  it("recognizes a response from another bundled PocketBase module instance", () => {
    const crossBundleError = {
      name: "ClientResponseError 404",
      status: 404,
      response: { code: 404, message: "The requested resource wasn't found." },
    };

    expect(isNotFoundError(crossBundleError)).toBe(true);
  });

  it("supports PocketBase response codes and rejects unrelated statuses", () => {
    expect(hasResponseStatus({ response: { code: 400 } }, 400)).toBe(true);
    expect(isNotFoundError({ status: 403, response: { code: 403 } })).toBe(false);
    expect(isNotFoundError(new Error("not found"))).toBe(false);
  });
});
