/**
 * Config plugin: patches expo-live-activity Lock Screen view to add
 * an action button (Start or Stop) that deep-links into the app.
 * Add after expo-live-activity in app.json plugins.
 */

const fs = require('fs');
const path = require('path');

const BUTTON_BLOCK = `
        // Sova: action button (Start nap/bedtime or End session)
        let isAwake = contentState.title == "Next nap" || contentState.title == "Bedtime"
        let actionPath = isAwake ? "/(tabs)/?action=startNap" : "/(tabs)/?action=endSession"
        if let scheme = cachedSchemeForSovaButton, let url = URL(string: scheme + "://" + actionPath) {
          Link(destination: url) {
            Text(isAwake ? "Start" : "Stop")
              .font(.subheadline)
              .fontWeight(.semibold)
          }
          .padding(.top, 8)
        }
`;

function getCachedSchemeSnippet(scheme) {
  const s = scheme || 'sova';
  return `private let cachedSchemeForSovaButton: String? = "${s}"`;
}

module.exports = function withSovaLiveActivityButton(config) {
  const scheme = config.scheme || config.expo?.scheme || 'sova';

  const { withDangerousMod } = require('@expo/config-plugins');
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const viewPath = path.join(projectRoot, 'ios', 'LiveActivity', 'LiveActivityView.swift');
      if (!fs.existsSync(viewPath)) return config;
      let content = fs.readFileSync(viewPath, 'utf8');
      if (content.includes('cachedSchemeForSovaButton')) return config;

      const schemeSnippet = getCachedSchemeSnippet(scheme);
      const closingPattern = /\n        \}\n      \}\n      \.padding\(EdgeInsets\(top: top, leading: leading, bottom: bottom, trailing: trailing\)\)\)/;
      const replacement =
        '\n        }\n' +
        BUTTON_BLOCK.trim() +
        '\n      }\n      .padding(EdgeInsets(top: top, leading: leading, bottom: bottom, trailing: trailing))';
      if (!closingPattern.test(content)) return config;
      content = content.replace(closingPattern, replacement);

      const insertSchemeAfter = 'struct LiveActivityView: View {';
      content = content.replace(
        insertSchemeAfter,
        insertSchemeAfter + '\n    ' + schemeSnippet
      );
      fs.writeFileSync(viewPath, content);
      return config;
    },
  ]);
};
