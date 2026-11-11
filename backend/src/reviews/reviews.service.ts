import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AccessScopeService } from '../access/access-scope.service';
import { AuthUser } from '../auth/auth-user';
import { addDays, parseIsoDate } from '../common/period';
import { Review, ReviewStatus } from '../database/entities';
import { ReviewsQueryDto, UpdateReviewDto } from './reviews.dto';

function toDto(r: Review) {
  return {
    id: r.id,
    branchId: r.branchId,
    branchName: r.branch?.name,
    companyId: r.branch?.companyId,
    source: r.source,
    authorName: r.authorName,
    rating: r.rating,
    text: r.text,
    status: r.status,
    reply: r.reply,
    publishedAt: r.publishedAt,
    processedAt: r.processedAt,
  };
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review) private readonly reviews: Repository<Review>,
    private readonly access: AccessScopeService,
  ) {}

  async list(user: AuthUser, q: ReviewsQueryDto) {
    // Проверяем даты до запроса к БД: несуществующая дата (2026-02-30) — это 400, а не ошибка БД
    if (q.from) parseIsoDate(q.from);
    if (q.to) parseIsoDate(q.to);
    const scope = await this.access.resolve(user, q);
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;

    const base = (): SelectQueryBuilder<Review> => {
      const qb = this.reviews.createQueryBuilder('r').innerJoin('r.branch', 'b');
      if (scope.companyId !== null) qb.andWhere('b.company_id = :companyId', { companyId: scope.companyId });
      if (scope.branchId !== null) qb.andWhere('r.branch_id = :branchId', { branchId: scope.branchId });
      if (q.rating?.length) qb.andWhere('r.rating IN (:...ratings)', { ratings: q.rating });
      if (q.from) qb.andWhere('r.published_at >= CAST(:from AS date)', { from: q.from });
      if (q.to) qb.andWhere('r.published_at < CAST(:toNext AS date)', { toNext: addDays(q.to, 1) });
      return qb;
    };

    if (q.from && q.to && q.from > q.to) throw new BadRequestException('Дата начала периода позже даты окончания');

    const listQb = base().addSelect(['b.id', 'b.name', 'b.companyId']);
    if (q.status) listQb.andWhere('r.status = :status', { status: q.status });
    listQb.orderBy('r.publishedAt', 'DESC').addOrderBy('r.id', 'DESC').skip((page - 1) * limit).take(limit);

    // Счётчики по статусам — с теми же фильтрами, но без фильтра статуса (для вкладок в UI)
    const countsQb = base().select('r.status', 'status').addSelect('COUNT(*)::int', 'count').groupBy('r.status');

    const [[items, total], countRows] = await Promise.all([
      listQb.getManyAndCount(),
      countsQb.getRawMany<{ status: ReviewStatus; count: number }>(),
    ]);

    const statusCounts = Object.fromEntries(Object.values(ReviewStatus).map((s) => [s, 0])) as Record<ReviewStatus, number>;
    for (const row of countRows) statusCounts[row.status] = row.count;

    return { items: items.map(toDto), total, page, limit, statusCounts };
  }

  async update(user: AuthUser, id: number, dto: UpdateReviewDto) {
    if (dto.status === undefined && dto.reply === undefined) {
      throw new BadRequestException('Нечего обновлять: передайте status и/или reply');
    }
    const review = await this.reviews.findOne({ where: { id }, relations: { branch: true } });
    if (!review) throw new NotFoundException('Отзыв не найден');
    this.access.assertOwnedOrNotFound(user, review.branch.companyId, 'Отзыв не найден');

    if (dto.reply !== undefined) review.reply = dto.reply?.trim() || null;
    if (dto.status !== undefined && dto.status !== review.status) {
      review.status = dto.status;
      review.processedAt = dto.status === ReviewStatus.Resolved ? new Date() : null;
    }
    const saved = await this.reviews.save(review);
    return toDto(saved);
  }
}
