import type { Actor, Review, WeeklyReport } from '../domain/types';
import { newId } from '../lib/id';
import type { Repository } from '../repositories/repository';

function countBy<T extends string>(values: T[]): Record<T, number> {
  return values.reduce((accumulator, value) => {
    accumulator[value] = (accumulator[value] ?? 0) + 1;
    return accumulator;
  }, {} as Record<T, number>);
}

export class ReportService {
  constructor(private readonly repository: Repository, private readonly actor: Actor) {}

  async generate(restaurantId: string, periodStart: string, periodEnd: string): Promise<WeeklyReport> {
    const allReviews = await this.repository.listReviews(restaurantId, { limit: 500 }, this.actor);
    const reviews = allReviews.filter((review) => review.reviewDate >= periodStart && review.reviewDate <= periodEnd);
    const actions = await this.repository.listInternalActions(restaurantId, this.actor);
    const findings = await this.repository.listListingFindings(restaurantId, this.actor);

    const byRisk = countBy(reviews.map((review) => review.classification?.risk ?? 'unknown'));
    const byState = countBy(reviews.map((review) => review.state));
    const byCategory = countBy(reviews.map((review) => review.classification?.primaryCategory ?? 'OTHER'));
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 3);

    const summary = {
      reviewsProcessed: reviews.length,
      ratings: {
        positive: reviews.filter((review) => review.rating >= 4).length,
        mixed: reviews.filter((review) => review.rating === 3).length,
        negative: reviews.filter((review) => review.rating <= 2).length,
      },
      byRisk,
      byState,
      topCategories,
      openActions: actions.filter((action) => action.status === 'open' || action.status === 'in_progress').map((action) => ({
        id: action.id,
        priority: action.priority,
        description: action.description,
        dueAt: action.dueAt,
      })),
      pendingListingFindings: findings.filter((finding) => !['dismissed', 'corrected', 'closed'].includes(finding.status)).map((finding) => ({
        id: finding.id,
        field: finding.field,
        severity: finding.severity,
        status: finding.status,
        recommendedAction: finding.recommendedAction,
      })),
      caveats: reviews.length < 3 ? ['Small sample: do not treat category counts as a stable trend.'] : [],
      generatedFromReviewIds: reviews.map((review: Review) => review.id),
    };

    return this.repository.createWeeklyReport({
      id: newId(),
      restaurantId,
      periodStart,
      periodEnd,
      status: 'draft',
      summary,
      createdAt: new Date().toISOString(),
    }, this.actor);
  }
}
