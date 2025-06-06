import { Either, left, right } from '@/core/either';
import { BadRequestException } from '@nestjs/common';

export class CRM {
  private readonly _value: string;

  get value(): string {
    return this._value;
  }

  private constructor(crm: string) {
    this._value = crm;
  }

  static isValid(crm: string): boolean {
    const crmRegex = /^\d{4,7}-[A-Z]{2}$/;
    return crmRegex.test(crm);
  }

  static create(crm: string): Either<BadRequestException, CRM> {
    if (!this.isValid(crm)) {
      return left(
        new BadRequestException(
          'Hmm... não conseguimos reconhecer esse CRM. Verifique se está no formato certo.',
        ),
      );
    }
    return right(new CRM(crm));
  }

  equals(other: CRM) {
    return this._value === other.value;
  }

  static fromParts(crm: string, uf: string): Either<Error, CRM> {
    const crmString = `${crm}-${uf.toUpperCase()}`;
    return this.create(crmString);
  }

  split(): { crm: string; uf: string } {
    const [crm, uf] = this._value.split('-');
    return { crm, uf };
  }
}
