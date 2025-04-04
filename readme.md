## Get Signed JWT for Your Credential

1. Ask our team to create your client application for your organization. Our team will provide auth0's `domain` and `audience`, and a specified `clientId`
2. Launcx use Private JWT Token to authenticate, so you'll need to generate a PEM-formatted private and public key (we provide sample script to generate the keys), which you need to share with Launcx as verification method (only share the public key, keep the private key at a safe place)
3. Implement a service get your signed jwt (we provide an example for typescript, you can always implement it in your chosen language)
4. Call Launcx's API to generate token, which will be used to call Launcx's protected endpoints

### Sample Script in Typescript

```
const clientId = <auth-client-id>;
const domain = <auth-domain>;
const audience = <auth-audience>;

const TOKEN_URL = `https://${domain}/oauth/token`;

const payload = {
  iss: domain,
  sub: clientId,
  aud: TOKEN_URL,
  iat: Math.floor(Date.now() / 1000), // current time
  exp: Math.floor(Date.now() / 1000) + 60 * 5, // expiration time (5 minutes)
};

const signedJwt = jwt.sign(payload, privateKey, { algorithm: 'RS256' });
```

### Generate PEM-formatted Public and Private Keys

```
# generate private.pem
openssl genpkey -algorithm RSA -out private.pem -aes256

# generate public.pem
openssl rsa -pubout -in private.pem -out public.pem

# verify your public key
openssl pkey -pubin -in public.pem -text
```
# laucxserver
