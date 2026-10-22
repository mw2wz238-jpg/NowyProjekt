export class PointerHoldState {
  private pointerId: number | null = null;

  public begin(pointerId: number): boolean {
    if (this.pointerId !== null) return false;
    this.pointerId = pointerId;
    return true;
  }

  public end(pointerId: number): boolean {
    if (this.pointerId !== pointerId) return false;
    this.pointerId = null;
    return true;
  }
}
