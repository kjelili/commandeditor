/**
 * Hello World Plugin Example
 * Demonstrates the CommandEditor Plugin SDK
 */

const HelloWorldPlugin = {
  manifest: {
    id: 'hello-world',
    name: 'Hello World',
    version: '1.0.0',
    description: 'A simple example plugin',
    author: 'CommandEditor Team',
    license: 'MIT',
    main: 'index.js',
    contributes: {
      commands: [
        {
          command: 'sayHello',
          title: 'Say Hello',
          category: 'Demo',
          keybinding: 'Ctrl+Shift+H'
        }
      ],
      panels: [
        {
          id: 'greeting',
          title: 'Greeting Panel',
          location: 'sidebar'
        }
      ]
    },
    permissions: ['notifications']
  },

  async activate(context) {
    // Register a command
    const cmd = context.api.registerCommand('sayHello', async () => {
      const doc = context.api.getPDFDocument();
      const pageCount = doc ? doc.numPages : 0;

      await context.api.showMessage(
        `Hello from Hello World plugin! You have ${pageCount} pages open.`,
        { type: 'info', title: 'Greeting' }
      );
    });
    context.push(cmd);

    // Register a panel
    const panel = context.api.registerPanel('greeting', {
      title: 'Greeting',
      render(container) {
        container.innerHTML = `
          <div style="padding: 16px;">
            <h3>👋 Hello World</h3>
            <p>This is a demo plugin panel.</p>
            <button id="hw-btn">Click Me</button>
          </div>
        `;
        container.querySelector('#hw-btn').addEventListener('click', () => {
          context.api.showMessage('Button clicked!', { type: 'success' });
        });
      }
    });
    context.push(panel);

    // Listen for document events
    const unsub = context.api.onDocumentOpen((doc) => {
      console.log('[HelloWorld] Document opened:', doc.filename);
    });
    context.push(unsub);

    // Store some data
    const storage = context.api.getStorage();
    let count = storage.get('clickCount') || 0;
    storage.set('clickCount', count + 1);
  },

  async deactivate() {
    console.log('[HelloWorld] Plugin deactivated');
  }
};

export default HelloWorldPlugin;
