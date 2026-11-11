import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { IdParamPipe } from '../common/id-param.pipe';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators';
import { ReviewsQueryDto, UpdateReviewDto } from './reviews.dto';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: ReviewsQueryDto) {
    return this.reviews.list(user, q);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id', IdParamPipe) id: number, @Body() dto: UpdateReviewDto) {
    return this.reviews.update(user, id, dto);
  }
}
