import { describe, beforeEach, it, expect, vi } from 'vitest';
import { InMemoryRecoveryPasswordRepository } from 'test/memory/repositories/prontuario/recovery-password.repository';
import { InMemoryOperatorRepository } from 'test/memory/repositories/clinicas/operator.repository';
import { ResetPasswordUseCase } from './reset-password.use-case';
import { Hasher } from '@/core/cryptography/hasher';
import { ConfigService } from '@nestjs/config';
import { Env } from '@/infra/env/env';
import {
  RecoverPasswordCodeExpiredError,
  RecoverPasswordCodeNotFoundError,
} from './errors';
import { DomainEvents } from '@/core/events/domain-events';
import { PasswordSuccessfullyReset } from '@/domain/professional/events/password-successfully-reset.event';

describe('RecoverPasswordUseCase', () => {
  let useCase: ResetPasswordUseCase;
  let operatorRepository: InMemoryOperatorRepository;
  let recoveryRepository: InMemoryRecoveryPasswordRepository;

  const fakeEmail = 'john.doe@example.com';
  const fakeCode = '123456';
  const fakePassword = 'new_secure_password';

  beforeEach(() => {
    operatorRepository = new InMemoryOperatorRepository();
    recoveryRepository = new InMemoryRecoveryPasswordRepository();

    const hasherMock = {
      hash: vi.fn().mockResolvedValue('hashed_password'),
      compare: vi.fn().mockResolvedValue(true),
    } as unknown as Hasher;

    const configMock = {
      get: vi.fn().mockReturnValue('https://deovita.com'),
    } as unknown as ConfigService<Env, true>;

    useCase = new ResetPasswordUseCase(
      operatorRepository,
      recoveryRepository,
      hasherMock,
      configMock,
    );

    recoveryRepository.clear();
  });

  it('should return error when recovery code for the given email is not found', async () => {
    const result = await useCase.execute({
      email: fakeEmail,
      code: fakeCode,
      password: fakePassword,
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(RecoverPasswordCodeNotFoundError);
  });

  it('should successfully reset the password when code is valid and not expired', async () => {
    operatorRepository.save({
      id: 'op-01',
      fullname: 'John Doe',
      cpf: '12345678900',
      email: fakeEmail,
      password: 'old_password',
    });

    recoveryRepository.recoveryRequests.push({
      id: 'rec-01',
      email: fakeEmail,
      userId: 'op-01',
      code: fakeCode,
      expiresAt: new Date(Date.now() + 1000 * 60 * 5), // 1h
      used: false,
      createdAt: new Date(),
    });

    const result = await useCase.execute({
      email: fakeEmail,
      code: fakeCode,
      password: fakePassword,
    });

    expect(result.isRight()).toBe(true);
    if (result.isRight()) {
      expect(result.value).toEqual({ success: true });
    }

    const updated = await operatorRepository.findByEmail(fakeEmail);
    if (updated) {
      expect(updated[0].password).toBe('hashed_password');
    }

    expect(recoveryRepository.recoveryRequests[0].used).toBe(true);
  });

  it('should dispatch PasswordSuccessfullyReset event after successful reset', async () => {
    const dispatchSpy = vi.spyOn(DomainEvents, 'dispatch');

    operatorRepository.save({
      id: 'op-01',
      fullname: 'John Doe',
      cpf: '12345678900',
      email: fakeEmail,
      password: 'old_password',
    });

    recoveryRepository.recoveryRequests.push({
      id: 'rec-01',
      email: fakeEmail,
      userId: 'op-01',
      code: fakeCode,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10), // válido
      used: false,
      createdAt: new Date(),
    });

    const result = await useCase.execute({
      email: fakeEmail,
      code: fakeCode,
      password: fakePassword,
    });

    expect(result.isRight()).toBe(true);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.any(PasswordSuccessfullyReset),
    );

    const dispatchedEvent = dispatchSpy.mock.calls.find(
      ([event]) => event instanceof PasswordSuccessfullyReset,
    )?.[0];

    expect(dispatchedEvent).toBeDefined();
    expect(dispatchedEvent).toMatchObject({
      email: fakeEmail,
    });
  });

  it('should return error when the recovery code is expired', async () => {
    recoveryRepository.recoveryRequests.push({
      id: 'rec-02',
      email: fakeEmail,
      userId: 'op-01',
      code: fakeCode,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() - 1000), // 1 segundo
      used: false,
    });

    const result = await useCase.execute({
      email: fakeEmail,
      code: fakeCode,
      password: fakePassword,
    });

    expect(result.isLeft()).toBe(true);
    expect(result.value).toBeInstanceOf(RecoverPasswordCodeExpiredError);
  });
});
