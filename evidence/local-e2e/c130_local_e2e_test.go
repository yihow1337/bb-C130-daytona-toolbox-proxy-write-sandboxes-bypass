// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0
//
// C130 LOCAL END-TO-END PROXY PROOF (synthetic data only)
//
// Proves at RUNTIME that the proxy /toolbox/{sandboxId}/... Bearer path authorizes a
// request purely on the API membership gate (PreviewAPI.HasSandboxAccess). When that
// gate returns 200 (which the API returns for ANY org member, including a Viewer with
// no write:sandboxes), the proxy accepts the Viewer's Bearer token and forwards the
// toolbox request (stripping Authorization before it reaches the sandbox).
//
// No real API/runner/SaaS. The Daytona API is replaced by a local httptest server.

package proxy

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	common_cache "github.com/daytonaio/common-go/pkg/cache"
	"github.com/daytonaio/proxy/cmd/proxy/config"
	"github.com/gin-gonic/gin"
)

const c130SandboxID = "sbx-c130-owned-by-owner"
const c130ViewerJWT = "viewer.jwt.synthetic-no-write-sandboxes"

func c130NewProxy(ctx context.Context, apiURL string, httpClient *http.Client) *Proxy {
	return &Proxy{
		config: &config.Config{
			DaytonaApiUrl: apiURL,
			ProxyApiKey:   "test-proxy-key-c130",
			EnableTLS:     false,
		},
		userAPIHTTPClient:        httpClient,
		sandboxAuthKeyValidCache: common_cache.NewMapCache[bool](ctx),
	}
}

func c130ToolboxCtx(req *http.Request) *gin.Context {
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set(IS_TOOLBOX_REQUEST_KEY, true)
	return c
}

// POSITIVE: API access gate returns 200 (Viewer IS an org member) -> proxy accepts & forwards.
func TestC130_ProxyForwardsViewerBearer_WhenApiAccessGateAllows(t *testing.T) {
	ctx := context.Background()

	var accessHits int
	var sawBearer string
	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/access") {
			accessHits++
			sawBearer = r.Header.Get("Authorization")
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("true"))
			return
		}
		w.WriteHeader(http.StatusNotFound)
	}))
	defer apiSrv.Close()

	p := c130NewProxy(ctx, apiSrv.URL, apiSrv.Client())

	req := httptest.NewRequest(http.MethodPost, "/toolbox/"+c130SandboxID+"/process/execute", nil)
	req.Header.Set("Authorization", "Bearer "+c130ViewerJWT)
	gctx := c130ToolboxCtx(req)

	sandboxId, didRedirect, err := p.Authenticate(gctx, c130SandboxID, 2280)
	if err != nil {
		t.Fatalf("expected Viewer Bearer to be ACCEPTED on proxy toolbox path, got err=%v", err)
	}
	if didRedirect {
		t.Fatalf("expected no redirect for accepted toolbox bearer")
	}
	if sandboxId != c130SandboxID {
		t.Fatalf("expected sandboxId=%s, got %s", c130SandboxID, sandboxId)
	}
	if accessHits < 1 {
		t.Fatalf("expected proxy to consult membership-only HasSandboxAccess gate, hits=%d", accessHits)
	}
	if !strings.Contains(sawBearer, c130ViewerJWT) {
		t.Fatalf("expected proxy to forward Viewer bearer to the API gate, saw=%q", sawBearer)
	}
	// Proxy strips Authorization so it is NOT forwarded to the sandbox runner toolbox.
	if leftover := req.Header.Get("Authorization"); leftover != "" {
		t.Fatalf("expected Authorization header stripped after accept, got %q", leftover)
	}
	t.Logf("[C130][proxy POSITIVE] access gate 200 -> Authenticate accepted Viewer; sandboxId=%s didRedirect=%v accessHits=%d authStripped=true (proxy WILL forward toolbox)", sandboxId, didRedirect, accessHits)
}

// NEGATIVE CONTROL: API access gate returns 404 (NOT a member) -> proxy rejects.
func TestC130_ProxyRejectsBearer_WhenApiAccessGateDenies(t *testing.T) {
	ctx := context.Background()

	apiSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 404 is what the API returns to non-members (see PreviewController.hasSandboxAccess)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer apiSrv.Close()

	p := c130NewProxy(ctx, apiSrv.URL, apiSrv.Client())

	req := httptest.NewRequest(http.MethodPost, "/toolbox/"+c130SandboxID+"/process/execute", nil)
	req.Header.Set("Authorization", "Bearer "+c130ViewerJWT)
	gctx := c130ToolboxCtx(req)

	_, _, err := p.Authenticate(gctx, c130SandboxID, 2280)
	if err == nil {
		t.Fatalf("expected non-member Bearer to be REJECTED on proxy toolbox path, got err=nil")
	}
	t.Logf("[C130][proxy NEGATIVE] access gate 404 -> Authenticate rejected (err=%v) (proves proxy really relies on the membership gate)", err)
}
