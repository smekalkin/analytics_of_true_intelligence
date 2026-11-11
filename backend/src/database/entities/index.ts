import { Branch } from './branch.entity';
import { Company } from './company.entity';
import { DailyMetric } from './daily-metric.entity';
import { Review } from './review.entity';
import { User } from './user.entity';

export * from './branch.entity';
export * from './company.entity';
export * from './daily-metric.entity';
export * from './review.entity';
export * from './user.entity';

export const ENTITIES = [Company, User, Branch, DailyMetric, Review];
