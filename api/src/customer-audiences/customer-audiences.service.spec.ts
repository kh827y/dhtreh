import { CustomerAudiencesService } from "./customer-audiences.service";

describe("CustomerAudiencesService.parseSegmentFilters", () => {
  const prisma = {} as any;
  const metrics = { inc: jest.fn() } as any;
  const service = new CustomerAudiencesService(prisma, metrics);

  it("adds receipt filter for productIds", () => {
    const result = (service as any).parseSegmentFilters("m1", {
      productIds: ["p1", "p2"],
    });

    expect(result.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Receipt: {
            some: {
              merchantId: "m1",
              items: {
                some: {
                  productId: { in: ["p1", "p2"] },
                },
              },
            },
          },
        }),
      ]),
    );
  });

  it("adds receipt filter for categoryIds", () => {
    const result = (service as any).parseSegmentFilters("m1", {
      categories: "c1, c2",
    });

    expect(result.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Receipt: {
            some: {
              merchantId: "m1",
              items: {
                some: {
                  product: {
                    categoryId: { in: ["c1", "c2"] },
                  },
                },
              },
            },
          },
        }),
      ]),
    );
  });
});
