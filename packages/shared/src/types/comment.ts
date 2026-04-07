export interface Comment {
  id: string;
  reviewId: string;
  authorId: string | null;
  guestName: string | null;
  content: string;
  isLike: boolean;
  createdAt: string;
}

export interface CreateCommentInput {
  content: string;
}

export interface GuestCommentInput {
  content: string;
  guestName: string;
}
