/**
 * Config plugin: patches expo-live-activity Lock Screen view to add
 * an action button (Start or Stop) that deep-links into the app.
 * Add after expo-live-activity in app.json plugins.
 */

const fs = require('fs');
const path = require('path');

const BUTTON_BLOCK = `
        // Sova: action button (Start nap/bedtime or End session) — run=1 so app runs the action
        let isAwake = contentState.title.hasPrefix("Next nap") || contentState.title.hasPrefix("Bedtime")
        let actionPath = isAwake ? "/(tabs)/?action=startNap&run=1" : "/(tabs)/?action=endSession&run=1"
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
  const schemeSnippet = getCachedSchemeSnippet(scheme);

  const { withDangerousMod } = require('@expo/config-plugins');
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const viewPath = path.join(projectRoot, 'ios', 'LiveActivity', 'LiveActivityView.swift');
      if (!fs.existsSync(viewPath)) return config;
      let content = fs.readFileSync(viewPath, 'utf8');
      if (content.includes('cachedSchemeForSovaButton')) return config;

      const paddingLine = '.padding(EdgeInsets(top: top, leading: leading, bottom: bottom, trailing: trailing))';
      const searchStr = '        }\n      }\n      ' + paddingLine;
      const replacement =
        '        }\n' + BUTTON_BLOCK.trim() + '\n      }\n      ' + paddingLine;
      if (!content.includes('        }\n      }\n      ' + paddingLine)) {
        return config;
      }
      content = content.replace(searchStr, replacement);

      const insertSchemeAfter = 'struct LiveActivityView: View {';
      if (!content.includes(schemeSnippet)) {
        content = content.replace(
          insertSchemeAfter,
          insertSchemeAfter + '\n    ' + schemeSnippet
        );
      }
      fs.writeFileSync(viewPath, content);
      return config;
    },
  ]);
};
