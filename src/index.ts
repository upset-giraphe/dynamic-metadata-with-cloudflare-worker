// index.ts

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    // Access environment variables
    const SUPABASE_URL = env.SUPABASE_URL;
    const SUPABASE_API_KEY = env.SUPABASE_API_KEY;
    const SUPABASE_AUTH_TOKEN = env.SUPABASE_AUTH_TOKEN;

    // Parse the request URL
    const url = new URL(request.url);

    // Exclude asset and API requests
    const excludedExtensions = [
      '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico',
      '.woff', '.woff2', '.ttf', '.eot', '.otf', '.json', '.pdf'
    ];
    const apiPrefixes = ['/api/', '/ww/'];

    function isAssetRequest(pathname: string): boolean {
      return excludedExtensions.some(ext => pathname.endsWith(ext));
    }

    function isApiRequest(pathname: string): boolean {
      return apiPrefixes.some(prefix => pathname.startsWith(prefix));
    }

    if (isAssetRequest(url.pathname) || isApiRequest(url.pathname)) {
      // Return the original content for assets and APIs
      return fetch(request);
    }

    // Determine if the request is for a dynamic page
    const dynamicPagePattern = /^\/product\/([a-f0-9-]+)\/?$/;
    const match = url.pathname.match(dynamicPagePattern);

    if (match) {
      // Extract the product ID from the URL
      const productId = match[1];
      console.log('Processing dynamic page for product ID:', productId);

      // Fetch the original HTML content
      const originResponse = await fetch(request);

      // Clone the response to read its body
      const responseClone = originResponse.clone();
      const originalHtml = await responseClone.text();

      // Fetch metadata from Supabase
      let metadata;
      try {
        metadata = await fetchMetadata(productId, SUPABASE_URL, SUPABASE_API_KEY, SUPABASE_AUTH_TOKEN);
        if (!metadata) {
          console.log('No metadata found, returning original content');
          return originResponse;
        }
        console.log('Metadata fetched:', metadata);
      } catch (error) {
        console.error('Error fetching metadata:', error);
        return originResponse;
      }

      // Use HTMLRewriter to inject metadata
      const rewriter = new HTMLRewriter()
        .on('title', new TitleHandler(metadata))
        .on('meta', new MetaHandler(metadata));

      // Return the modified HTML response
      return new Response(rewriter.transform(originResponse).body, originResponse);
    } else {
      // For all other requests, return the original content
      return fetch(request);
    }
  }
};

// Function to fetch metadata from Supabase
async function fetchMetadata(
  id: string,
  supabaseUrl: string,
  supabaseApiKey: string,
  supabaseAuthToken: string
): Promise<any> {
  const url = `${supabaseUrl}/rest/v1/rpc/get_product_meta`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'apikey': supabaseApiKey,
      'Authorization': `Bearer ${supabaseAuthToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id: id }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Supabase error:', response.status, response.statusText, errorText);
    return null;
  }

  const data = await response.json();
  // Assuming the data is returned as an array
  return Array.isArray(data) ? data[0] : data;
}

// Handler for modifying the <title> tag
class TitleHandler {
  metadata: any;

  constructor(metadata: any) {
    this.metadata = metadata;
  }

  element(element: Element) {
    if (this.metadata.title) {
      element.setInnerContent(this.metadata.title);
    }
  }
}

// Handler for modifying <meta> tags
class MetaHandler {
  metadata: any;

  constructor(metadata: any) {
    this.metadata = metadata;
  }

  element(element: Element) {
    const nameAttr = element.getAttribute('name');
    const propertyAttr = element.getAttribute('property');

    if (nameAttr) {
      switch (nameAttr) {
        case 'description':
          if (this.metadata.description) {
            element.setAttribute('content', this.metadata.description);
          }
          break;
        case 'keywords':
          if (this.metadata.keywords) {
            element.setAttribute('content', this.metadata.keywords);
          }
          break;
        case 'robots':
          // Ensure 'noindex' is present
          let content = element.getAttribute('content') || '';
          if (!content.includes('noindex')) {
            content += (content ? ', ' : '') + 'noindex';
            element.setAttribute('content', content);
          }
          break;
        default:
          break;
      }
    }

    if (propertyAttr) {
      switch (propertyAttr) {
        case 'og:title':
          if (this.metadata.title) {
            element.setAttribute('content', this.metadata.title);
          }
          break;
        case 'og:description':
          if (this.metadata.description) {
            element.setAttribute('content', this.metadata.description);
          }
          break;
        case 'og:image':
          if (this.metadata.image) {
            element.setAttribute('content', this.metadata.image);
          }
          break;
        default:
          break;
      }
    }
  }
}
