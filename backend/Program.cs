using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.OpenApi.Models;

var builder = WebApplication.CreateBuilder(args);

// Shared JSON settings for consistent API responses (controllers + error handler).
var jsonSerializerOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    WriteIndented = false,
    DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
};

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.PropertyNamingPolicy = jsonSerializerOptions.PropertyNamingPolicy;
        options.JsonSerializerOptions.WriteIndented = jsonSerializerOptions.WriteIndented;
        options.JsonSerializerOptions.DefaultIgnoreCondition = jsonSerializerOptions.DefaultIgnoreCondition;
    });

builder.Services.AddEndpointsApiExplorer();
// OpenAPI generator — always registered (no environment check).
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "Restaurant API",
        Version = "v1",
    });
});

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders =
        ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.KnownNetworks.Clear();
    options.KnownProxies.Clear();
});

// Temporary: allow any origin for frontend integration (tighten to specific URLs for production).
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAll", policy =>
        policy.AllowAnyOrigin()
            .AllowAnyHeader()
            .AllowAnyMethod());
});

var app = builder.Build();

app.UseExceptionHandler(exceptionHandlerApp =>
{
    exceptionHandlerApp.Run(async context =>
    {
        var exception = context.Features.Get<IExceptionHandlerPathFeature>()?.Error;
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        context.Response.ContentType = "application/json; charset=utf-8";

        if (app.Environment.IsDevelopment() && exception is not null)
        {
            await context.Response.WriteAsJsonAsync(new
            {
                error = "An unexpected error occurred.",
                detail = exception.Message,
            }, jsonSerializerOptions);
        }
        else
        {
            await context.Response.WriteAsJsonAsync(new
            {
                error = "An unexpected error occurred.",
            }, jsonSerializerOptions);
        }
    });
});

// Azure / reverse proxy: correct scheme and client IP behind load balancer.
app.UseForwardedHeaders();

// Swagger UI + JSON — always on in Production and Development (never wrap in IsDevelopment()).
app.UseSwagger();
app.UseSwaggerUI(options =>
{
    options.SwaggerEndpoint("/swagger/v1/swagger.json", "Restaurant API v1");
    options.RoutePrefix = "swagger";
});

app.UseHttpsRedirection();

// Endpoint routing + CORS (CORS must run after UseRouting, before endpoints).
app.UseRouting();
app.UseCors("AllowAll");

// Attribute-routed API controllers (e.g. api/menu, api/orders).
app.MapControllers();

app.Run();
