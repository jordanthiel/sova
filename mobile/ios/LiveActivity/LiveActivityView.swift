import SwiftUI
import WidgetKit

#if canImport(ActivityKit)

  struct ConditionalForegroundViewModifier: ViewModifier {
    let color: String?

    func body(content: Content) -> some View {
      if let color = color {
        content.foregroundStyle(Color(hex: color))
      } else {
        content
      }
    }
  }

  struct DebugLog: View {
    #if DEBUG
      private let message: String
      init(_ message: String) {
        self.message = message
        print(message)
      }

      var body: some View {
        Text(message)
          .font(.caption2)
          .foregroundStyle(.red)
      }
    #else
      init(_: String) {}
      var body: some View { EmptyView() }
    #endif
  }

  struct LiveActivityView: View {
    let contentState: LiveActivityAttributes.ContentState
    let attributes: LiveActivityAttributes
    @State private var imageContainerSize: CGSize?

    private struct ParsedSubtitle {
      let babyName: String?
      let productName: String?
      let detailLine: String?
      let timestampMs: Double?
    }

    var progressViewTint: Color? {
      attributes.progressViewTint.map { Color(hex: $0) }
    }

    private var parsedSubtitle: ParsedSubtitle {
      guard let subtitle = contentState.subtitle, subtitle.contains("|||") else {
        return ParsedSubtitle(
          babyName: nil,
          productName: nil,
          detailLine: contentState.subtitle,
          timestampMs: nil
        )
      }

      let parts = subtitle.components(separatedBy: "|||")
      let timestampMs = parts.count > 3 ? Double(parts[3]) : nil

      return ParsedSubtitle(
        babyName: parts.indices.contains(0) && !parts[0].isEmpty ? parts[0] : nil,
        productName: parts.indices.contains(1) && !parts[1].isEmpty ? parts[1] : nil,
        detailLine: parts.indices.contains(2) && !parts[2].isEmpty ? parts[2] : nil,
        timestampMs: timestampMs
      )
    }

    private var imageAlignment: Alignment {
      switch attributes.imageAlign {
      case "center":
        return .center
      case "bottom":
        return .bottom
      default:
        return .top
      }
    }

    private func alignedImage(imageName: String) -> some View {
      let defaultHeight: CGFloat = 64
      let defaultWidth: CGFloat = 64
      let containerHeight = imageContainerSize?.height
      let containerWidth = imageContainerSize?.width
      let hasWidthConstraint = (attributes.imageWidthPercent != nil) || (attributes.imageWidth != nil)

      let computedHeight: CGFloat? = {
        if let percent = attributes.imageHeightPercent {
          let clamped = min(max(percent, 0), 100) / 100.0
          // Use the row height as a base. Fallback to default when row height is not measured yet.
          let base = (containerHeight ?? defaultHeight)
          return base * clamped
        } else if let size = attributes.imageHeight {
          return CGFloat(size)
        } else if hasWidthConstraint {
          // Mimic CSS: when only width is set, keep height automatic to preserve aspect ratio
          return nil
        } else {
          // Mimic CSS: this works against CSS but provides a better default behavior.
          // When no width/height is set, use a default size (64pt)
          // Width will adjust automatically base on aspect ratio
          return defaultHeight
        }
      }()

      let computedWidth: CGFloat? = {
        if let percent = attributes.imageWidthPercent {
          let clamped = min(max(percent, 0), 100) / 100.0
          let base = (containerWidth ?? defaultWidth)
          return base * clamped
        } else if let size = attributes.imageWidth {
          return CGFloat(size)
        } else {
          return nil // Keep aspect fit based on height
        }
      }()

      return ZStack(alignment: .center) {
        Group {
          let fit = attributes.contentFit ?? "cover"
          switch fit {
          case "contain":
            Image.dynamic(assetNameOrPath: imageName).resizable().scaledToFit().frame(width: computedWidth, height: computedHeight)
          case "fill":
            Image.dynamic(assetNameOrPath: imageName).resizable().frame(
              width: computedWidth,
              height: computedHeight
            )
          case "none":
            Image.dynamic(assetNameOrPath: imageName).renderingMode(.original).frame(width: computedWidth, height: computedHeight)
          case "scale-down":
            if let uiImage = UIImage.dynamic(assetNameOrPath: imageName) {
              // Determine the target box. When width/height are nil, we use image's intrinsic dimension for comparison.
              let targetHeight = computedHeight ?? uiImage.size.height
              let targetWidth = computedWidth ?? uiImage.size.width
              let shouldScaleDown = uiImage.size.height > targetHeight || uiImage.size.width > targetWidth

              if shouldScaleDown {
                Image(uiImage: uiImage)
                  .resizable()
                  .scaledToFit()
                  .frame(width: computedWidth, height: computedHeight)
              } else {
                Image(uiImage: uiImage)
                  .renderingMode(.original)
                  .frame(width: min(uiImage.size.width, targetWidth), height: min(uiImage.size.height, targetHeight))
              }
            } else {
              DebugLog("⚠️[ExpoLiveActivity] assetNameOrPath couldn't resolve to UIImage")
            }
          case "cover":
            Image.dynamic(assetNameOrPath: imageName).resizable().scaledToFill().frame(
              width: computedWidth,
              height: computedHeight
            ).clipped()
          default:
            DebugLog("⚠️[ExpoLiveActivity] Unknown contentFit '\(fit)'")
          }
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: imageAlignment)
      .background(
        GeometryReader { proxy in
          Color.clear
            .onAppear {
              let s = proxy.size
              if s.width > 0, s.height > 0 { imageContainerSize = s }
            }
            .onChange(of: proxy.size) { s in
              if s.width > 0, s.height > 0 { imageContainerSize = s }
            }
        }
      )
    }

    @ViewBuilder
    private var headerRow: some View {
      if parsedSubtitle.babyName != nil || parsedSubtitle.productName != nil {
        HStack(alignment: .center) {
          if let babyName = parsedSubtitle.babyName {
            Text(babyName)
              .font(.caption)
              .fontWeight(.semibold)
              .lineLimit(1)
              .modifier(ConditionalForegroundViewModifier(color: attributes.subtitleColor))
          }

          Spacer(minLength: 8)

          if let productName = parsedSubtitle.productName {
            Text(productName)
              .font(.caption)
              .fontWeight(.medium)
              .lineLimit(1)
              .modifier(ConditionalForegroundViewModifier(color: attributes.subtitleColor))
          }
        }
      }
    }

    @ViewBuilder
    private var titleBlock: some View {
      VStack(alignment: .leading, spacing: 4) {
        // Sleeping: system-rendered elapsed timer (counts up every second natively on lock screen)
        // Awake: static title text (e.g. "Next nap 2:30 PM" or "Bedtime 7:30 PM")
        if let timestampMs = parsedSubtitle.timestampMs {
          Text(timerInterval: Date.toElapsedTimerInterval(miliseconds: timestampMs), countsDown: false)
            .font(.system(size: 30, weight: .semibold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .monospacedDigit()
            .modifier(ConditionalForegroundViewModifier(color: attributes.titleColor))
        } else {
          Text(contentState.title)
            .font(.system(size: 30, weight: .semibold, design: .rounded))
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .modifier(ConditionalForegroundViewModifier(color: attributes.titleColor))
        }

        // Detail line: cap time ("Cap by 3:00 PM"), nap type, or window range
        if let detailLine = parsedSubtitle.detailLine {
          Text(detailLine)
            .font(.subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .modifier(ConditionalForegroundViewModifier(color: attributes.subtitleColor))
        } else if let subtitle = contentState.subtitle, !subtitle.contains("|||") {
          Text(subtitle)
            .font(.subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .modifier(ConditionalForegroundViewModifier(color: attributes.subtitleColor))
        }
      }
    }

    var body: some View {
      let defaultPadding = 24

      let top = CGFloat(
        attributes.paddingDetails?.top
          ?? attributes.paddingDetails?.vertical
          ?? attributes.padding
          ?? defaultPadding
      )

      let bottom = CGFloat(
        attributes.paddingDetails?.bottom
          ?? attributes.paddingDetails?.vertical
          ?? attributes.padding
          ?? defaultPadding
      )

      let leading = CGFloat(
        attributes.paddingDetails?.left
          ?? attributes.paddingDetails?.horizontal
          ?? attributes.padding
          ?? defaultPadding
      )

      let trailing = CGFloat(
        attributes.paddingDetails?.right
          ?? attributes.paddingDetails?.horizontal
          ?? attributes.padding
          ?? defaultPadding
      )

      VStack(alignment: .leading) {
        let position = attributes.imagePosition ?? "right"
        let isStretch = position.contains("Stretch")
        let isLeftImage = position.hasPrefix("left")
        let hasImage = contentState.imageName != nil
        let effectiveStretch = isStretch && hasImage

        HStack(alignment: .center) {
          if hasImage, isLeftImage {
            if let imageName = contentState.imageName {
              alignedImage(imageName: imageName)
            }
          }

          VStack(alignment: .leading, spacing: 8) {
            headerRow
            titleBlock

            if effectiveStretch {
              if let date = contentState.timerEndDateInMilliseconds {
                ProgressView(timerInterval: Date.toTimerInterval(miliseconds: date))
                  .tint(progressViewTint)
                  .modifier(ConditionalForegroundViewModifier(color: attributes.progressViewLabelColor))
              } else if let progress = contentState.progress {
                ProgressView(value: progress)
                  .tint(progressViewTint)
                  .modifier(ConditionalForegroundViewModifier(color: attributes.progressViewLabelColor))
              }
            }
          }.layoutPriority(1)

          if hasImage, !isLeftImage { // right side (default)
            Spacer()
            if let imageName = contentState.imageName {
              alignedImage(imageName: imageName)
            }
          }
        }

        if !effectiveStretch {
          if let date = contentState.timerEndDateInMilliseconds {
            ProgressView(timerInterval: Date.toTimerInterval(miliseconds: date))
              .tint(progressViewTint)
              .modifier(ConditionalForegroundViewModifier(color: attributes.progressViewLabelColor))
          } else if let progress = contentState.progress {
            ProgressView(value: progress)
              .tint(progressViewTint)
              .modifier(ConditionalForegroundViewModifier(color: attributes.progressViewLabelColor))
          }
        }
      }
      .padding(EdgeInsets(top: top, leading: leading, bottom: bottom, trailing: trailing))
    }
  }

#endif
