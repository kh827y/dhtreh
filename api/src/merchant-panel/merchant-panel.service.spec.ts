import { MerchantPanelService } from './merchant-panel.service';
import { StaffStatus, StaffRole, AccessScope, StaffOutletAccessStatus } from '@prisma/client';

describe('MerchantPanelService', () => {
  it('listStaff returns mapped payload and records metrics', async () => {
    const staffMember: any = {
      id: 'stf_1',
      login: 'john',
      email: 'john@example.com',
      phone: null,
      firstName: 'John',
      lastName: 'Doe',
      position: 'Manager',
      comment: null,
      role: StaffRole.MANAGER,
      status: StaffStatus.ACTIVE,
      portalAccessEnabled: true,
      canAccessPortal: true,
      isOwner: false,
      accesses: [
        {
          id: 'acc_1',
          outletId: 'out_1',
          outlet: { name: 'Главный магазин' },
          pinCode: '1234',
          status: StaffOutletAccessStatus.ACTIVE,
        },
      ],
      accessGroupMemberships: [
        {
          groupId: 'grp_1',
          group: { id: 'grp_1', name: 'Менеджеры', scope: AccessScope.PORTAL },
        },
      ],
    };

    const countMock = jest
      .fn()
      .mockResolvedValueOnce(1) // total
      .mockResolvedValueOnce(1) // active
      .mockResolvedValueOnce(0) // pending
      .mockResolvedValueOnce(0) // suspended
      .mockResolvedValueOnce(0) // fired
      .mockResolvedValueOnce(0) // archived
      .mockResolvedValueOnce(1); // portalEnabled

    const prisma: any = {
      staff: {
        findMany: jest.fn().mockResolvedValue([staffMember]),
        count: countMock,
      },
      $transaction: jest.fn((operations: Promise<any>[]) => Promise.all(operations)),
    };
    const merchants: any = {};
    const metrics = { inc: jest.fn(), observe: jest.fn(), setGauge: jest.fn() } as any;

    const service = new MerchantPanelService(prisma, merchants, metrics);
    const result = await service.listStaff('mrc_1', {}, { page: 1, pageSize: 20 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(result.meta.total).toBe(1);
    expect(result.counters.active).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'stf_1',
        email: 'john@example.com',
        role: StaffRole.MANAGER,
        accesses: [
          expect.objectContaining({ outletName: 'Главный магазин', status: StaffOutletAccessStatus.ACTIVE }),
        ],
      }),
    );
    expect(metrics.inc).toHaveBeenCalledWith('portal_staff_list_total');
  });
});
