export const config = {
  domainSource: "https://de44a60c-0fc7-4e82-bf89-8d4b1b9e0fc9.weweb-preview.io/", // Your WeWeb app preview link
  patterns: [
      {
          pattern: "/products/[^/]+",
          metaDataEndpoint: "https://lfbxzrylbkxjryzzvftv.supabase.co/rest/v1/rpc/get_product_meta"
      }
  ]
};
