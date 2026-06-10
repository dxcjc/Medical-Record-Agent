import { describe, expect, it } from "vitest";

import { normalizeProviderItems } from "./normalizers";
import type { ApiCollectionResponse, ApiProviderItem } from "./types";

describe("api normalizers", () => {
  it("normalizes provider list items without materializing undefined optional fields", () => {
    const source = ({
      items: [
        {
          key: "openai-responses-model",
          name: undefined,
          displayName: undefined,
          label: undefined,
          enabled: true,
          isDefault: true,
          isMock: false,
          status: undefined,
          config: undefined,
          secretRefs: undefined
        }
      ]
    } as unknown) as ApiCollectionResponse<ApiProviderItem>;

    const [provider] = normalizeProviderItems(source);
    if (!provider) {
      throw new Error("provider fixture should normalize");
    }

    expect(provider).toEqual({
      key: "openai-responses-model",
      name: "未命名 provider",
      enabled: true,
      isDefault: true,
      isMock: false
    });
    expect(Object.hasOwn(provider, "displayName")).toBe(false);
    expect(Object.hasOwn(provider, "status")).toBe(false);
    expect(Object.hasOwn(provider, "config")).toBe(false);
    expect(Object.hasOwn(provider, "secretRefs")).toBe(false);
  });
});
