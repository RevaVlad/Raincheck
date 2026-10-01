import { LockMode, type EntityManager } from '@mikro-orm/postgresql';
import { IntervalEntity } from '../entities/interval.entity.js';
import { ResponseEntity } from '../entities/response.entity.js';

export interface IntervalRepository {
  findResponseForUpdate(em: EntityManager, responseId: string): Promise<ResponseEntity>;
  findByResponse(em: EntityManager, responseId: string): Promise<IntervalEntity[]>;
  replace(em: EntityManager, responseId: string, replacement: readonly IntervalEntity[]): Promise<void>;
}

export class MikroIntervalRepository implements IntervalRepository {
  async findResponseForUpdate(em: EntityManager, responseId: string): Promise<ResponseEntity> {
    const response = await em.findOne(ResponseEntity, responseId, {
      populate: ['poll'],
      lockMode: LockMode.PESSIMISTIC_WRITE,
    });
    if (!response) throw new Error('Response not found');
    return response;
  }

  findByResponse(em: EntityManager, responseId: string): Promise<IntervalEntity[]> {
    return em.find(IntervalEntity, { response: responseId });
  }

  async replace(
    em: EntityManager,
    responseId: string,
    replacement: readonly IntervalEntity[],
  ): Promise<void> {
    await em.nativeDelete(IntervalEntity, { response: responseId });
    replacement.forEach((interval) => em.persist(interval));
  }
}
