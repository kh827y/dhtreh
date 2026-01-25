import { Injectable } from '@nestjs/common';
import type {
  ListCustomersQuery,
  PortalCustomerDto,
} from './portal-customers.types';
import { PortalCustomersOperationsService } from './portal-customers-operations.service';
import { PortalCustomersQueryService } from './portal-customers-query.service';
import { PortalCustomersMutationsService } from './portal-customers-mutations.service';

export * from './portal-customers.types';

@Injectable()
export class PortalCustomersService {
  constructor(
    private readonly queries: PortalCustomersQueryService,
    private readonly operations: PortalCustomersOperationsService,
    private readonly mutations: PortalCustomersMutationsService,
  ) {}

  list(merchantId: string, query: ListCustomersQuery) {
    return this.queries.list(merchantId, query);
  }

  get(merchantId: string, customerId: string) {
    return this.queries.get(merchantId, customerId);
  }

  accrueManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      purchaseAmount: number;
      points?: number | null;
      receiptNumber?: string | null;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    return this.operations.accrueManual(
      merchantId,
      customerId,
      staffId,
      payload,
    );
  }

  redeemManual(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      points: number;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    return this.operations.redeemManual(
      merchantId,
      customerId,
      staffId,
      payload,
    );
  }

  issueComplimentary(
    merchantId: string,
    customerId: string,
    staffId: string | null,
    payload: {
      points: number;
      expiresInDays?: number | null;
      outletId?: string | null;
      comment?: string | null;
    },
  ) {
    return this.operations.issueComplimentary(
      merchantId,
      customerId,
      staffId,
      payload,
    );
  }

  create(
    merchantId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.mutations.create(merchantId, dto);
  }

  update(
    merchantId: string,
    customerId: string,
    dto: Partial<PortalCustomerDto> & {
      firstName?: string;
      lastName?: string;
    },
  ) {
    return this.mutations.update(merchantId, customerId, dto);
  }

  erasePersonalData(merchantId: string, customerId: string) {
    return this.mutations.erasePersonalData(merchantId, customerId);
  }

  remove(merchantId: string, customerId: string) {
    return this.mutations.remove(merchantId, customerId);
  }
}
