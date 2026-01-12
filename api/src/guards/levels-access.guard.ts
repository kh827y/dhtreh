import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { firstValueFrom, isObservable } from 'rxjs';
import { CashierGuard } from './cashier.guard';
import { TelegramMiniappGuard } from './telegram-miniapp.guard';

@Injectable()
export class LevelsAccessGuard implements CanActivate {
  constructor(
    private readonly telegramGuard: TelegramMiniappGuard,
    private readonly cashierGuard: CashierGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (await this.tryGuard(this.telegramGuard, context)) return true;
    if (await this.tryGuard(this.cashierGuard, context)) return true;
    throw new UnauthorizedException('Unauthorized');
  }

  private async tryGuard(
    guard: CanActivate,
    context: ExecutionContext,
  ): Promise<boolean> {
    try {
      const result = guard.canActivate(context);
      if (isObservable(result)) {
        return await firstValueFrom(result);
      }
      return await Promise.resolve(result);
    } catch {
      return false;
    }
  }
}
