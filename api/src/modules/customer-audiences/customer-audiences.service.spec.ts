import { CustomerAudiencesService } from './customer-audiences.service';
import type { MetricsService } from '../../core/metrics/metrics.service';
import type { PrismaService } from '../../core/prisma/prisma.service';

type MockFn<Return = unknown, Args extends unknown[] = unknown[]> = jest.Mock<
  Return,
  Args
>;
type MetricsStub = { inc: MockFn };
type PrismaStub = Record<string, unknown>;
type ParsedSegmentFilters = { where: { AND: unknown[] } };
type ServicePrivate = {
  parseSegmentFilters: (
    merchantId: string,
    filters: unknown,
  ) => ParsedSegmentFilters;
};

const mockFn = <Return = unknown, Args extends unknown[] = unknown[]>() =>
  jest.fn<Return, Args>();
const asPrismaService = (stub: PrismaStub) => stub as unknown as PrismaService;
const asMetricsService = (stub: MetricsStub) =>
  stub as unknown as MetricsService;
const asPrivateService = (service: CustomerAudiencesService) =>
  service as unknown as ServicePrivate;

describe('CustomerAudiencesService.parseSegmentFilters', () => {
  const prisma: PrismaStub = {};
  const metrics: MetricsStub = { inc: mockFn() };
  const service = new CustomerAudiencesService(
    asPrismaService(prisma),
    asMetricsService(metrics),
  );

  it('adds receipt filter for productIds', () => {
    const result = asPrivateService(service).parseSegmentFilters('m1', {
      productIds: ['p1', 'p2'],
    });

    expect(result.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Receipt: {
            some: {
              merchantId: 'm1',
              items: {
                some: {
                  productId: { in: ['p1', 'p2'] },
                },
              },
            },
          },
        }),
      ]),
    );
  });

  it('adds receipt filter for categoryIds', () => {
    const result = asPrivateService(service).parseSegmentFilters('m1', {
      categories: 'c1, c2',
    });

    expect(result.where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          Receipt: {
            some: {
              merchantId: 'm1',
              items: {
                some: {
                  product: {
                    categoryId: { in: ['c1', 'c2'] },
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
