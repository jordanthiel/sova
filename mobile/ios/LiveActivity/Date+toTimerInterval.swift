import SwiftUI

extension Date {
  /// Builds a range for `ProgressView(timerInterval:)` / `Text(timerInterval:)`.
  /// - When **anchor** (ms since 1970) is in the **future**: countdown from now → anchor.
  /// - When **anchor** is in the **past** (e.g. nap start): count-up / elapsed from anchor → now.
  static func toTimerInterval(miliseconds: Double) -> ClosedRange<Self> {
    let anchor = Date(timeIntervalSince1970: miliseconds / 1000)
    let now = Date()
    if anchor > now {
      return now ... anchor
    }
    // Count-up: `anchor ... Date()` is entirely in the past a moment later, so the timer
    // freezes until the next ActivityKit update. Keep the range end in the future.
    return anchor ... .distantFuture
  }

  /// `true` if the anchor timestamp is still in the future (countdown UI).
  static func timerIntervalCountsDown(miliseconds: Double) -> Bool {
    Date(timeIntervalSince1970: miliseconds / 1000) > Date()
  }
}
