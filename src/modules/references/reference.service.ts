import { Injectable } from '@nestjs/common';
import { ReferenceRepository } from './adapters/reference.repository';
import type { ReferenceQuery } from './reference-contract';

/** Application surface for historical references; persistence stays in its adapter. */
@Injectable()
export class ReferenceService {
  constructor(private readonly repository: ReferenceRepository) {}

  getReference(query: ReferenceQuery) {
    return this.repository.getReference(query);
  }
}
